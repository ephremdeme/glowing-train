import { createHs256Jwt } from '@cryptopay/auth';
import { closePool, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCoreApiApp } from '../src/app.js';

async function ensureTables(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists customer_account (
      customer_id text primary key,
      full_name text not null,
      country_code text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists sender_kyc_profile (
      customer_id text primary key references customer_account(customer_id) on delete cascade,
      provider text not null default 'sumsub',
      applicant_id text,
      kyc_status text not null check (kyc_status in ('pending', 'approved', 'rejected')) default 'pending',
      reason_code text,
      last_reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists recipient (
      recipient_id text primary key,
      customer_id text not null references customer_account(customer_id) on delete cascade,
      full_name text not null,
      bank_account_name text not null,
      bank_account_number text not null,
      bank_code text not null,
      phone_e164 text,
      country_code text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists receiver_kyc_profile (
      receiver_id text primary key,
      recipient_id text,
      kyc_status text not null check (kyc_status in ('approved', 'pending', 'rejected')),
      national_id_verified boolean not null default false,
      national_id_hash text,
      national_id_encrypted jsonb,
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query('alter table receiver_kyc_profile add column if not exists recipient_id text');

  await pool.query(`
    create table if not exists quotes (
      quote_id text primary key,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null,
      fx_rate_usd_to_etb numeric(18, 6) not null,
      fee_usd numeric(12, 2) not null,
      recipient_amount_etb numeric(14, 2) not null,
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
      sender_kyc_status text not null,
      receiver_kyc_status text not null,
      receiver_national_id_verified boolean not null default false,
      chain text not null,
      token text not null,
      send_amount_usd numeric(12, 2) not null,
      status text not null,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists deposit_routes (
      route_id text primary key,
      transfer_id text not null unique references transfers(transfer_id) on delete cascade,
      chain text not null,
      token text not null,
      deposit_address text not null,
      deposit_memo text,
      status text not null default 'active',
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create table if not exists onchain_funding_event (
      event_id text primary key,
      chain text not null,
      token text not null,
      tx_hash text not null,
      log_index integer not null,
      transfer_id text not null unique references transfers(transfer_id),
      deposit_address text not null,
      amount_usd numeric(12,2) not null,
      confirmed_at timestamptz not null,
      created_at timestamptz not null default now(),
      unique(chain, tx_hash, log_index)
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
    create table if not exists idempotency_record (
      key text primary key,
      request_hash text not null,
      response_status integer not null,
      response_body jsonb not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
}

function customerToken(customerId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return createHs256Jwt(
    {
      sub: customerId,
      iss: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
      aud: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services',
      exp: now + 3600,
      iat: now,
      tokenType: 'customer'
    },
    process.env.AUTH_JWT_SECRET ?? 'test-jwt-secret'
  );
}

async function seedCustomer(customerId: string, fullName: string): Promise<void> {
  await getPool().query(
    "insert into customer_account (customer_id, full_name, country_code, status) values ($1, $2, 'US', 'active')",
    [customerId, fullName]
  );
  await getPool().query(
    "insert into sender_kyc_profile (customer_id, provider, kyc_status, updated_at) values ($1, 'sumsub', 'approved', now())",
    [customerId]
  );
}

async function seedRecipient(recipientId: string, customerId: string): Promise<void> {
  await getPool().query(
    `
      insert into recipient (
        recipient_id, customer_id, full_name, bank_account_name, bank_account_number, bank_code, country_code, status
      ) values ($1, $2, 'Abebe Kebede', 'Abebe Kebede', '1002003004005', 'CBE', 'ET', 'active')
    `,
    [recipientId, customerId]
  );

  await getPool().query(
    `
      insert into receiver_kyc_profile (receiver_id, recipient_id, kyc_status, national_id_verified)
      values ($1, $1, 'pending', false)
      on conflict (receiver_id) do nothing
    `,
    [recipientId]
  );
}

async function seedTransfer(transferId: string, senderId: string, recipientId: string, status: string = 'AWAITING_FUNDING'): Promise<void> {
  const quoteId = `q_${transferId}`;
  await getPool().query(
    `
      insert into quotes (
        quote_id, chain, token, send_amount_usd, fx_rate_usd_to_etb, fee_usd, recipient_amount_etb, expires_at
      ) values ($1, 'base', 'USDC', 100, 140, 1, 13860, now() + interval '5 minute')
    `,
    [quoteId]
  );

  await getPool().query(
    `
      insert into transfers (
        transfer_id, quote_id, sender_id, receiver_id,
        sender_kyc_status, receiver_kyc_status, receiver_national_id_verified,
        chain, token, send_amount_usd, status
      ) values ($1, $2, $3, $4, 'approved', 'approved', true, 'base', 'USDC', 100, $5)
    `,
    [transferId, quoteId, senderId, recipientId, status]
  );

  await getPool().query(
    `
      insert into deposit_routes (route_id, transfer_id, chain, token, deposit_address, status)
      values ($1, $2, 'base', 'USDC', $3, 'active')
    `,
    [`route_${transferId}`, transferId, `dep_${transferId}`]
  );

  await getPool().query(
    `
      insert into transfer_transition (transfer_id, from_state, to_state, metadata)
      values ($1, 'AWAITING_FUNDING', $2, '{}')
    `,
    [transferId, status]
  );

  await getPool().query(
    `
      insert into onchain_funding_event (event_id, chain, token, tx_hash, log_index, transfer_id, deposit_address, amount_usd, confirmed_at)
      values ($1, 'base', 'USDC', $2, 1, $3, $4, 100, now())
      on conflict do nothing
    `,
    [`evt_${transferId}`, `0x${transferId}`, transferId, `dep_${transferId}`]
  );

  await getPool().query(
    `
      insert into payout_instruction (payout_id, transfer_id, method, recipient_account_ref, amount_etb, status)
      values ($1, $2, 'bank', 'CBE-001', 13860, 'PAYOUT_INITIATED')
      on conflict do nothing
    `,
    [`pay_${transferId}`, transferId]
  );
}

describe('customer transfer APIs integration', () => {
  let app: Awaited<ReturnType<typeof buildCoreApiApp>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';
    process.env.AUTH_JWT_SECRET = 'test-jwt-secret';
    process.env.AUTH_JWT_ISSUER = 'cryptopay-internal';
    process.env.AUTH_JWT_AUDIENCE = 'cryptopay-services';

    await ensureTables();
    app = await buildCoreApiApp();
  });

  beforeEach(async () => {
    await getPool().query(
      'truncate table transfer_transition, onchain_funding_event, payout_instruction, deposit_routes, transfers, quotes, receiver_kyc_profile, recipient, sender_kyc_profile, customer_account, audit_log, idempotency_record cascade'
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closePool();
  });

  it('lists sender-owned transfer history only', async () => {
    await seedCustomer('cust_a', 'Sender A');
    await seedCustomer('cust_b', 'Sender B');
    await seedRecipient('rcp_a', 'cust_a');
    await seedRecipient('rcp_b', 'cust_b');
    await seedTransfer('tr_a_1', 'cust_a', 'rcp_a');
    await seedTransfer('tr_b_1', 'cust_b', 'rcp_b');

    const response = await app.inject({
      method: 'GET',
      url: '/v1/transfers?limit=20',
      headers: {
        authorization: `Bearer ${customerToken('cust_a')}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { count: number; items: Array<{ transferId: string; recipientName: string | null }> };

    expect(body.count).toBe(1);
    expect(body.items[0]?.transferId).toBe('tr_a_1');
    expect(body.items[0]?.recipientName).toBe('Abebe Kebede');
  });

  it('returns transfer detail for owner and rejects non-owner access', async () => {
    await seedCustomer('cust_owner', 'Owner');
    await seedCustomer('cust_other', 'Other');
    await seedRecipient('rcp_owner', 'cust_owner');
    await seedTransfer('tr_owner_1', 'cust_owner', 'rcp_owner', 'PAYOUT_INITIATED');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/transfers/tr_owner_1',
      headers: {
        authorization: `Bearer ${customerToken('cust_other')}`
      }
    });

    expect(forbidden.statusCode).toBe(404);

    const own = await app.inject({
      method: 'GET',
      url: '/v1/transfers/tr_owner_1',
      headers: {
        authorization: `Bearer ${customerToken('cust_owner')}`
      }
    });

    expect(own.statusCode).toBe(200);
    const body = own.json() as {
      transfer: { transferId: string; status: string };
      payout: { status: string } | null;
      transitions: Array<{ toState: string }>;
    };

    expect(body.transfer.transferId).toBe('tr_owner_1');
    expect(body.transfer.status).toBe('PAYOUT_INITIATED');
    expect(body.payout?.status).toBe('PAYOUT_INITIATED');
    expect(body.transitions.length).toBeGreaterThan(0);
  });

  it('updates recipient receiver KYC through recipient patch and writes audit entry', async () => {
    await seedCustomer('cust_patch', 'Patch User');
    await seedRecipient('rcp_patch', 'cust_patch');

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/recipients/rcp_patch',
      headers: {
        authorization: `Bearer ${customerToken('cust_patch')}`
      },
      payload: {
        kycStatus: 'approved',
        nationalIdVerified: true,
        nationalId: 'ET-NEW-1234'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      recipientId: string;
      receiverKyc: { kycStatus: string; nationalIdVerified: boolean } | null;
    };

    expect(body.recipientId).toBe('rcp_patch');
    expect(body.receiverKyc?.kycStatus).toBe('approved');
    expect(body.receiverKyc?.nationalIdVerified).toBe(true);

    const kyc = await getPool().query(
      'select kyc_status, national_id_verified from receiver_kyc_profile where receiver_id = $1 limit 1',
      ['rcp_patch']
    );
    expect(kyc.rows[0]?.kyc_status).toBe('approved');
    expect(kyc.rows[0]?.national_id_verified).toBe(true);

    const audit = await getPool().query(
      "select count(*)::int as count from audit_log where action = 'recipient_kyc_updated' and entity_id = $1",
      ['rcp_patch']
    );
    expect(audit.rows[0]?.count).toBe(1);
  });
});
