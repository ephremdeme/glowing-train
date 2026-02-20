import {
  BankPayoutAdapter,
  NonRetryableAdapterError,
  RetryableAdapterError,
  type PayoutRequest,
  type PayoutResponse
} from '@cryptopay/adapters';
import { closePool, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PayoutRepository, PayoutService } from '../src/modules/payouts/index.js';

async function ensureTables(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists idempotency_record (
      key text primary key,
      request_hash text not null,
      response_status integer not null,
      response_body jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);

  await pool.query(`
    create table if not exists audit_log (
      id bigserial primary key,
      actor_type text not null,
      actor_id text not null,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      reason text,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists transfer_transition (
      id bigserial primary key,
      transfer_id text not null,
      from_state text,
      to_state text not null,
      occurred_at timestamptz not null default now(),
      metadata jsonb
    )
  `);

  await pool.query(`
    create table if not exists quotes (
      quote_id text primary key,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
      fx_rate_usd_to_etb numeric(18, 6) not null check (fx_rate_usd_to_etb > 0),
      fee_usd numeric(12, 2) not null check (fee_usd >= 0),
      recipient_amount_etb numeric(14, 2) not null check (recipient_amount_etb >= 0),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists transfers (
      transfer_id text primary key,
      quote_id text,
      sender_id text,
      receiver_id text,
      sender_kyc_status text,
      receiver_kyc_status text,
      receiver_national_id_verified boolean,
      chain text,
      token text,
      send_amount_usd numeric(12,2),
      status text not null,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists payout_instruction (
      payout_id text primary key,
      transfer_id text not null unique references transfers(transfer_id),
      method text not null,
      recipient_account_ref text not null,
      amount_etb numeric(14,2) not null,
      status text not null,
      provider_reference text,
      attempt_count integer not null default 0,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists payout_status_event (
      id bigserial primary key,
      payout_id text not null references payout_instruction(payout_id),
      transfer_id text not null,
      from_status text,
      to_status text not null,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `);
}

async function seedTransfer(transferId: string, status: string = 'FUNDING_CONFIRMED'): Promise<void> {
  const quoteId = `q_${transferId}`;

  await getPool().query(
    `
    insert into quotes (
      quote_id, chain, token, send_amount_usd, fx_rate_usd_to_etb, fee_usd, recipient_amount_etb, expires_at
    ) values ($1, 'base', 'USDC', 100, 140, 1, 13860, '2027-01-01T00:00:00.000Z')
    on conflict (quote_id) do nothing
    `,
    [quoteId]
  );

  await getPool().query(
    `
    insert into transfers (
      transfer_id, quote_id, sender_id, receiver_id,
      sender_kyc_status, receiver_kyc_status, receiver_national_id_verified,
      chain, token, send_amount_usd, status
    ) values ($1, $2, 's_1', 'r_1', 'approved', 'approved', true, 'base', 'USDC', 100, $3)
    `,
    [transferId, quoteId, status]
  );
}

describe('payout orchestration integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    await ensureTables();
  });

  beforeEach(async () => {
    await getPool().query('truncate table payout_status_event, payout_instruction, transfer_transition, audit_log, idempotency_record, transfers restart identity cascade');
  });

  afterAll(async () => {
    await closePool();
  });

  it('initiates bank payout and records payout initiated state', async () => {
    await seedTransfer('tr_pay_success');

    const transport = async (_request: PayoutRequest): Promise<PayoutResponse> => ({
      providerReference: 'bank_ref_1',
      acceptedAt: new Date('2026-02-12T00:00:00.000Z')
    });

    const service = new PayoutService(new PayoutRepository(), {
      bank: new BankPayoutAdapter(transport)
    });

    const result = await service.initiatePayout({
      transferId: 'tr_pay_success',
      method: 'bank',
      recipientAccountRef: 'CBE-0001',
      amountEtb: 12000,
      idempotencyKey: 'idem-payout-001'
    });

    expect(result.status).toBe('initiated');
    expect(result.providerReference).toBe('bank_ref_1');

    const transfer = await getPool().query('select status from transfers where transfer_id = $1', ['tr_pay_success']);
    expect(transfer.rows[0]?.status).toBe('PAYOUT_INITIATED');
  });

  it('retries retryable bank failures and succeeds', async () => {
    await seedTransfer('tr_pay_retry');

    let attempts = 0;
    const transport = async (_request: PayoutRequest): Promise<PayoutResponse> => {
      attempts += 1;
      if (attempts < 3) {
        throw new RetryableAdapterError('partner timeout');
      }

      return {
        providerReference: 'bank_ref_after_retry',
        acceptedAt: new Date('2026-02-12T00:00:00.000Z')
      };
    };

    const service = new PayoutService(new PayoutRepository(), {
      bank: new BankPayoutAdapter(transport)
    });

    const result = await service.initiatePayout({
      transferId: 'tr_pay_retry',
      method: 'bank',
      recipientAccountRef: 'CBE-0002',
      amountEtb: 13000,
      idempotencyKey: 'idem-payout-002'
    });

    expect(result.status).toBe('initiated');
    expect(result.attempts).toBe(3);
  });

  it('routes non-retryable payout failure to review required', async () => {
    await seedTransfer('tr_pay_review');

    const transport = async (_request: PayoutRequest): Promise<PayoutResponse> => {
      throw new NonRetryableAdapterError('invalid beneficiary account');
    };

    const service = new PayoutService(new PayoutRepository(), {
      bank: new BankPayoutAdapter(transport)
    });

    const result = await service.initiatePayout({
      transferId: 'tr_pay_review',
      method: 'bank',
      recipientAccountRef: 'INVALID-ACC',
      amountEtb: 11000,
      idempotencyKey: 'idem-payout-003'
    });

    expect(result.status).toBe('review_required');

    const transfer = await getPool().query('select status from transfers where transfer_id = $1', ['tr_pay_review']);
    expect(transfer.rows[0]?.status).toBe('PAYOUT_REVIEW_REQUIRED');
  });

  it('returns idempotent response for duplicate payout initiation', async () => {
    await seedTransfer('tr_pay_idem');

    const service = new PayoutService(new PayoutRepository(), {
      bank: new BankPayoutAdapter(async () => ({ providerReference: 'bank_ref_idem', acceptedAt: new Date() }))
    });

    const first = await service.initiatePayout({
      transferId: 'tr_pay_idem',
      method: 'bank',
      recipientAccountRef: 'CBE-0003',
      amountEtb: 14000,
      idempotencyKey: 'idem-payout-005'
    });

    const second = await service.initiatePayout({
      transferId: 'tr_pay_idem',
      method: 'bank',
      recipientAccountRef: 'CBE-0003',
      amountEtb: 14000,
      idempotencyKey: 'idem-payout-005'
    });

    expect(second.payoutId).toBe(first.payoutId);
    expect(second.status).toBe(first.status);
  });
});
