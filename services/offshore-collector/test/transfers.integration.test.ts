import { closePool, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  IdempotencyConflictError,
  QuoteExpiredError,
  TransferRepository,
  TransferService,
  TransferValidationError
} from '../src/modules/transfers/index.js';

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
      quote_id text not null references quotes(quote_id),
      sender_id text not null,
      receiver_id text not null,
      sender_kyc_status text not null check (sender_kyc_status in ('approved', 'pending', 'rejected')),
      receiver_kyc_status text not null check (receiver_kyc_status in ('approved', 'pending', 'rejected')),
      receiver_national_id_verified boolean not null default false,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
      status text not null check (
        status in (
          'TRANSFER_CREATED',
          'AWAITING_FUNDING',
          'FUNDING_CONFIRMED',
          'PAYOUT_INITIATED',
          'PAYOUT_COMPLETED',
          'PAYOUT_FAILED',
          'PAYOUT_REVIEW_REQUIRED'
        )
      ) default 'AWAITING_FUNDING',
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists deposit_routes (
      route_id text primary key,
      transfer_id text not null unique references transfers(transfer_id) on delete cascade,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      deposit_address text not null,
      deposit_memo text,
      status text not null check (status in ('active', 'retired')) default 'active',
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(
    'create unique index if not exists idx_deposit_routes_chain_token_address on deposit_routes(chain, token, deposit_address)'
  );

  await pool.query(`
    create table if not exists receiver_kyc_profile (
      receiver_id text primary key,
      kyc_status text not null check (kyc_status in ('approved', 'pending', 'rejected')),
      national_id_verified boolean not null default false,
      national_id_hash text,
      national_id_encrypted jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

async function seedQuote(params?: { quoteId?: string; expiresAt?: string; chain?: 'base' | 'solana'; token?: 'USDC' | 'USDT' }): Promise<string> {
  const quoteId = params?.quoteId ?? `q_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = params?.expiresAt ?? '2027-02-12T00:10:00.000Z';
  const chain = params?.chain ?? 'base';
  const token = params?.token ?? 'USDC';

  await getPool().query(
    `
    insert into quotes (
      quote_id,
      chain,
      token,
      send_amount_usd,
      fx_rate_usd_to_etb,
      fee_usd,
      recipient_amount_etb,
      expires_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [quoteId, chain, token, 100, 140, 1, 13860, expiresAt]
  );

  return quoteId;
}

describe('transfer creation integration', () => {
  let repository: TransferRepository;
  let service: TransferService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'offshore';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    repository = new TransferRepository();
    service = new TransferService(repository);

    await ensureTables();
  });

  beforeEach(async () => {
    await getPool().query('truncate table quotes cascade');
    await repository.clearTransferDataForTests();
    await getPool().query('truncate table receiver_kyc_profile');
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates transfer with unique active deposit route', async () => {
    const quoteIdA = await seedQuote({ quoteId: 'q_a' });
    const quoteIdB = await seedQuote({ quoteId: 'q_b' });

    const first = await service.createTransfer({
      quoteId: quoteIdA,
      senderId: 'sender_1',
      receiverId: 'receiver_1',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-transfer-001'
    });

    const second = await service.createTransfer({
      quoteId: quoteIdB,
      senderId: 'sender_1',
      receiverId: 'receiver_2',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-transfer-002'
    });

    expect(first.transfer.status).toBe('AWAITING_FUNDING');
    expect(first.depositRoute.status).toBe('active');
    expect(first.depositRoute.transferId).toBe(first.transfer.transferId);
    expect(first.depositRoute.depositAddress).not.toBe(second.depositRoute.depositAddress);
  });

  it('returns idempotent response for duplicate request with same key and payload', async () => {
    const quoteId = await seedQuote({ quoteId: 'q_idem' });

    const first = await service.createTransfer({
      quoteId,
      senderId: 'sender_1',
      receiverId: 'receiver_1',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-transfer-003'
    });

    const second = await service.createTransfer({
      quoteId,
      senderId: 'sender_1',
      receiverId: 'receiver_1',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-transfer-003'
    });

    expect(second.transfer.transferId).toBe(first.transfer.transferId);
    expect(second.depositRoute.routeId).toBe(first.depositRoute.routeId);
  });

  it('fails with idempotency conflict when key is reused with different payload', async () => {
    const quoteId = await seedQuote({ quoteId: 'q_conflict' });

    await service.createTransfer({
      quoteId,
      senderId: 'sender_1',
      receiverId: 'receiver_1',
      senderKycStatus: 'approved',
      receiverKycStatus: 'approved',
      receiverNationalIdVerified: true,
      idempotencyKey: 'idem-transfer-004'
    });

    await expect(
      service.createTransfer({
        quoteId,
        senderId: 'sender_1',
        receiverId: 'receiver_2',
        senderKycStatus: 'approved',
        receiverKycStatus: 'approved',
        receiverNationalIdVerified: true,
        idempotencyKey: 'idem-transfer-004'
      })
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('rejects when receiver national id is not verified', async () => {
    const quoteId = await seedQuote({ quoteId: 'q_nid' });

    await expect(
      service.createTransfer({
        quoteId,
        senderId: 'sender_1',
        receiverId: 'receiver_1',
        senderKycStatus: 'approved',
        receiverKycStatus: 'approved',
        receiverNationalIdVerified: false,
        idempotencyKey: 'idem-transfer-005'
      })
    ).rejects.toBeInstanceOf(TransferValidationError);
  });

  it('rejects expired quote on transfer creation', async () => {
    const quoteId = await seedQuote({ quoteId: 'q_expired', expiresAt: '2026-02-12T00:00:00.000Z' });

    await expect(
      service.createTransfer(
        {
          quoteId,
          senderId: 'sender_1',
          receiverId: 'receiver_1',
          senderKycStatus: 'approved',
          receiverKycStatus: 'approved',
          receiverNationalIdVerified: true,
          idempotencyKey: 'idem-transfer-006'
        },
        new Date('2026-02-12T00:00:01.000Z')
      )
    ).rejects.toBeInstanceOf(QuoteExpiredError);
  });

  it('uses receiver kyc profile over client-provided verification flags', async () => {
    const quoteId = await seedQuote({ quoteId: 'q_profile_override' });

    await getPool().query(
      `
      insert into receiver_kyc_profile (receiver_id, kyc_status, national_id_verified)
      values ('receiver_profile_1', 'pending', false)
      `
    );

    await expect(
      service.createTransfer({
        quoteId,
        senderId: 'sender_1',
        receiverId: 'receiver_profile_1',
        senderKycStatus: 'approved',
        receiverKycStatus: 'approved',
        receiverNationalIdVerified: true,
        idempotencyKey: 'idem-transfer-007'
      })
    ).rejects.toBeInstanceOf(TransferValidationError);
  });
});
