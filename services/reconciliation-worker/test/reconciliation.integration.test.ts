import { closeDb, query } from '@cryptopay/db';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReconciliationService } from '../src/modules/reconcile/index.js';

async function ensureTables(): Promise<void> {

  await query(`
    create table if not exists quotes (
      quote_id text primary key,
      chain text,
      token text,
      send_amount_usd numeric(12,2),
      fx_rate_usd_to_etb numeric(18,6),
      fee_usd numeric(12,2),
      recipient_amount_etb numeric(14,2),
      expires_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists transfers (
      transfer_id text primary key,
      quote_id text,
      status text,
      chain text,
      token text,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists onchain_funding_event (
      event_id text primary key,
      chain text,
      token text,
      tx_hash text,
      log_index integer,
      transfer_id text,
      deposit_address text,
      amount_usd numeric(12,2),
      confirmed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists payout_instruction (
      payout_id text primary key,
      transfer_id text,
      status text,
      method text,
      recipient_account_ref text,
      amount_etb numeric(14,2),
      provider_reference text,
      attempt_count integer,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists ledger_journal (
      journal_id text primary key,
      transfer_id text,
      description text,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists ledger_entry (
      id bigserial primary key,
      journal_id text,
      transfer_id text,
      account_code text,
      entry_type text,
      amount_usd numeric(12,2),
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists reconciliation_run (
      run_id text primary key,
      started_at timestamptz not null,
      finished_at timestamptz,
      total_transfers integer not null default 0,
      total_issues integer not null default 0,
      status text not null,
      error_message text
    )
  `);

  await query(`
    create table if not exists reconciliation_issue (
      id bigserial primary key,
      run_id text,
      transfer_id text,
      issue_code text,
      details jsonb,
      detected_at timestamptz not null default now()
    )
  `);
}

describe('reconciliation integration', () => {
  let service: ReconciliationService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    await ensureTables();
    service = new ReconciliationService();
  });

  beforeEach(async () => {
    await query(
      'truncate table reconciliation_issue, reconciliation_run, payout_instruction, onchain_funding_event, ledger_entry, ledger_journal, transfers, quotes restart identity cascade'
    );
  });

  afterAll(async () => {
    await closeDb();
  });

  it('produces reconciliation issues and csv output with required columns', async () => {
    await query(
      "insert into quotes (quote_id, chain, token, send_amount_usd, fx_rate_usd_to_etb, fee_usd, recipient_amount_etb, expires_at) values ('q_1','base','USDC',100,140,1,13860,'2027-01-01T00:00:00.000Z')"
    );

    await query(
      "insert into transfers (transfer_id, quote_id, sender_id, receiver_id, sender_kyc_status, receiver_kyc_status, receiver_national_id_verified, chain, token, send_amount_usd, status) values ('tr_1', 'q_1', 's_1', 'r_1', 'approved', 'approved', true, 'base', 'USDC', 100, 'PAYOUT_INITIATED')"
    );

    await query(
      "insert into ledger_journal (journal_id, transfer_id, description) values ('lj_1', 'tr_1', 'test')"
    );

    await query(
      "insert into ledger_entry (journal_id, transfer_id, account_code, entry_type, amount_usd) values ('lj_1', 'tr_1', 'cash', 'debit', 100), ('lj_1', 'tr_1', 'liability', 'credit', 90)"
    );

    const outDir = await mkdtemp(path.join(tmpdir(), 'recon-'));
    const csvPath = path.join(outDir, 'report.csv');

    const result = await service.runOnce(csvPath);
    expect(result.issueCount).toBeGreaterThan(0);

    const csv = await readFile(csvPath, 'utf8');
    expect(csv).toContain('transfer_id,quote_id,chain,token,funded_amount_usd,expected_etb,payout_status,ledger_balanced,issue_code,detected_at');
    expect(csv).toContain('LEDGER_IMBALANCE');
    expect(csv).toContain('MISSING_FUNDING_EVENT');
  });

  it('returns zero issues for balanced transfer with funding and payout record', async () => {
    await query(
      "insert into quotes (quote_id, chain, token, send_amount_usd, fx_rate_usd_to_etb, fee_usd, recipient_amount_etb, expires_at) values ('q_2','base','USDT',200,140,1,27860,'2027-01-01T00:00:00.000Z')"
    );

    await query(
      "insert into transfers (transfer_id, quote_id, sender_id, receiver_id, sender_kyc_status, receiver_kyc_status, receiver_national_id_verified, chain, token, send_amount_usd, status) values ('tr_2', 'q_2', 's_2', 'r_2', 'approved', 'approved', true, 'base', 'USDT', 200, 'PAYOUT_INITIATED')"
    );

    await query(
      "insert into onchain_funding_event (event_id, chain, token, tx_hash, log_index, transfer_id, deposit_address, amount_usd, confirmed_at) values ('evt_2','base','USDT','0x2',1,'tr_2','dep_2',200,now())"
    );

    await query(
      "insert into payout_instruction (payout_id, transfer_id, status, method, recipient_account_ref, amount_etb, attempt_count) values ('pay_2','tr_2','PAYOUT_INITIATED','bank','CBE-2',27860,1)"
    );

    await query(
      "insert into ledger_journal (journal_id, transfer_id, description) values ('lj_2', 'tr_2', 'test')"
    );

    await query(
      "insert into ledger_entry (journal_id, transfer_id, account_code, entry_type, amount_usd) values ('lj_2', 'tr_2', 'cash', 'debit', 200), ('lj_2', 'tr_2', 'liability', 'credit', 200)"
    );

    const result = await service.runOnce();
    expect(result.issueCount).toBe(0);
  });
});
