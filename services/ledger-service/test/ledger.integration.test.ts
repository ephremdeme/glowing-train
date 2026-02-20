import { closeDb, query } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LedgerService } from '../src/modules/ledger/index.js';

async function ensureTables(): Promise<void> {
  await query(`
    create table if not exists ledger_journal (
      journal_id text primary key,
      transfer_id text not null,
      description text,
      created_at timestamptz not null default now()
    )
  `);

  await query(`
    create table if not exists ledger_entry (
      id bigserial primary key,
      journal_id text not null references ledger_journal(journal_id) on delete cascade,
      transfer_id text not null,
      account_code text not null,
      entry_type text not null check (entry_type in ('debit', 'credit')),
      amount_usd numeric(12, 2) not null check (amount_usd > 0),
      created_at timestamptz not null default now()
    )
  `);
}

describe('ledger integration', () => {
  let ledger: LedgerService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    await ensureTables();
    ledger = new LedgerService();
  });

  beforeEach(async () => {
    await query('truncate table ledger_entry, ledger_journal restart identity cascade');
  });

  afterAll(async () => {
    await closeDb();
  });

  it('posts balanced double-entry journal', async () => {
    const posted = await ledger.postDoubleEntry({
      transferId: 'tr_ledger_1',
      debitAccount: 'offshore_cash',
      creditAccount: 'remittance_liability',
      amountUsd: 250,
      description: 'Funding confirmed'
    });

    expect(posted.balanced).toBe(true);
    expect(posted.totalDebitUsd).toBe(250);
    expect(posted.totalCreditUsd).toBe(250);

    const dbBalance = await ledger.getJournalBalance(posted.journalId);
    expect(dbBalance?.balanced).toBe(true);
  });

  it('rejects invalid posting with same account on both sides', async () => {
    await expect(
      ledger.postDoubleEntry({
        transferId: 'tr_ledger_2',
        debitAccount: 'offshore_cash',
        creditAccount: 'offshore_cash',
        amountUsd: 20
      })
    ).rejects.toThrow(/must be different/);
  });
});
