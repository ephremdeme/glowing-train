import { closeDb, query, withTransaction } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

async function ensureTables(): Promise<void> {
  await query(`
    create table if not exists transfers (
      transfer_id text primary key,
      quote_id text not null,
      sender_id text not null,
      receiver_id text not null,
      sender_kyc_status text not null,
      receiver_kyc_status text not null,
      receiver_national_id_verified boolean not null default false,
      chain text not null,
      token text not null,
      send_amount_usd numeric(12,2) not null,
      status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists transfer_transition (
      id bigserial primary key,
      transfer_id text not null,
      from_state text,
      to_state text not null,
      occurred_at timestamptz not null default now(),
      metadata jsonb
    )
  `);

  await query('create index if not exists idx_transfers_status_created on transfers(status, created_at desc)');
  await query('create index if not exists idx_transfer_transition_transfer_occurred on transfer_transition(transfer_id, occurred_at)');
}

async function explainPlan(sqlText: string): Promise<string> {
  return withTransaction(async (tx) => {
    await tx.query('set local enable_seqscan = off');
    const result = await tx.query<{ 'QUERY PLAN': string }>(`explain ${sqlText}`);
    return result.rows.map((row) => row['QUERY PLAN']).join('\n');
  });
}

describe('query-plan checks (core-api hot paths)', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = process.env.APP_REGION ?? 'ethiopia';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED ?? 'true';

    try {
      await query('select 1');
      dbAvailable = true;
      await ensureTables();
    } catch {
      dbAvailable = false;
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) {
      return;
    }

    await query('truncate table transfer_transition, transfers restart identity cascade');

    await query(`
      insert into transfers (
        transfer_id,
        quote_id,
        sender_id,
        receiver_id,
        sender_kyc_status,
        receiver_kyc_status,
        receiver_national_id_verified,
        chain,
        token,
        send_amount_usd,
        status,
        created_at,
        updated_at
      )
      select
        'tr_' || gs::text,
        'q_' || gs::text,
        'sender_' || (gs % 5)::text,
        'recipient_' || (gs % 7)::text,
        'approved',
        'approved',
        true,
        'base',
        'USDC',
        100,
        case when gs % 2 = 0 then 'AWAITING_FUNDING' else 'PAYOUT_INITIATED' end,
        now() - (gs * interval '1 minute'),
        now() - (gs * interval '1 minute')
      from generate_series(1, 400) as gs
    `);

    await query(`
      insert into transfer_transition (transfer_id, from_state, to_state, occurred_at, metadata)
      select
        'tr_2',
        case when gs = 1 then null else 'STATE_' || (gs - 1)::text end,
        'STATE_' || gs::text,
        now() + (gs * interval '5 second'),
        '{}'::jsonb
      from generate_series(1, 80) as gs
    `);
  });

  afterAll(async () => {
    if (dbAvailable) {
      await closeDb();
    }
  });

  it('ops transfer listing uses status+created index', async () => {
    if (!dbAvailable) {
      return;
    }

    const plan = await explainPlan(`
      select transfer_id, quote_id, sender_id, receiver_id, chain, token, send_amount_usd, status, created_at
      from transfers
      where status = 'AWAITING_FUNDING'
      order by created_at desc
      limit 50
    `);

    expect(plan).toMatch(/idx_transfers_status_created/i);
  });

  it('transitions history uses transfer+occurred index', async () => {
    if (!dbAvailable) {
      return;
    }

    const plan = await explainPlan(`
      select from_state, to_state, metadata, occurred_at
      from transfer_transition
      where transfer_id = 'tr_2'
      order by occurred_at asc
    `);

    expect(plan).toMatch(/idx_transfer_transition_transfer_occurred/i);
  });
});
