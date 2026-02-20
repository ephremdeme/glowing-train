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
    create table if not exists ledger_entry (
      id bigserial primary key,
      journal_id text not null,
      transfer_id text not null,
      account_code text not null,
      entry_type text not null,
      amount_usd numeric(12,2) not null,
      created_at timestamptz not null default now()
    )
  `);

  await query('create index if not exists idx_transfers_status_created on transfers(status, created_at desc)');
  await query('create index if not exists idx_transfers_created_at on transfers(created_at desc)');
  await query('create index if not exists idx_ledger_entry_transfer on ledger_entry(transfer_id)');
}

async function explainPlan(sqlText: string): Promise<string> {
  return withTransaction(async (tx) => {
    await tx.query('set local enable_seqscan = off');
    const result = await tx.query<{ 'QUERY PLAN': string }>(`explain ${sqlText}`);
    return result.rows.map((row) => row['QUERY PLAN']).join('\n');
  });
}

describe('query-plan checks (reconciliation hot paths)', () => {
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

    await query('truncate table ledger_entry, transfers restart identity cascade');

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
        case
          when gs % 3 = 0 then 'AWAITING_FUNDING'
          when gs % 3 = 1 then 'FUNDING_CONFIRMED'
          else 'PAYOUT_INITIATED'
        end,
        now() - (gs * interval '15 minute'),
        now() - (gs * interval '15 minute')
      from generate_series(1, 1200) as gs
    `);

    await query(`
      insert into ledger_entry (journal_id, transfer_id, account_code, entry_type, amount_usd)
      select
        'j_' || gs::text,
        'tr_' || ((gs % 300) + 1)::text,
        'cash',
        case when gs % 2 = 0 then 'debit' else 'credit' end,
        100
      from generate_series(1, 5000) as gs
    `);
  });

  afterAll(async () => {
    if (dbAvailable) {
      await closeDb();
    }
  });

  it('reconciliation transfer scan query avoids plain sequential scan', async () => {
    if (!dbAvailable) {
      return;
    }

    const plan = await explainPlan(`
      select transfer_id, quote_id, status, chain, token
      from transfers
      where status = any(array['AWAITING_FUNDING', 'FUNDING_CONFIRMED', 'PAYOUT_INITIATED', 'PAYOUT_REVIEW_REQUIRED'])
         or created_at >= now() - (14 * interval '1 day')
      order by created_at desc
      limit 500
    `);

    expect(plan).toMatch(/idx_transfers_status_created|idx_transfers_created_at/i);
  });

  it('reconciliation ledger aggregation uses transfer index', async () => {
    if (!dbAvailable) {
      return;
    }

    const plan = await explainPlan(`
      select
        transfer_id,
        coalesce(sum(case when entry_type = 'debit' then amount_usd else 0 end), 0)::numeric as debit_total,
        coalesce(sum(case when entry_type = 'credit' then amount_usd else 0 end), 0)::numeric as credit_total
      from ledger_entry
      where transfer_id in ('tr_1', 'tr_2', 'tr_3', 'tr_4', 'tr_5', 'tr_6', 'tr_7', 'tr_8')
      group by transfer_id
    `);

    expect(plan).toMatch(/idx_ledger_entry_transfer/i);
  });
});
