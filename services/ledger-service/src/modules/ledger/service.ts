import { getPool } from '@cryptopay/db';
import { randomUUID } from 'node:crypto';
import type { LedgerJournalResult, LedgerPosting } from '@cryptopay/domain';

type Pool = ReturnType<typeof getPool>;

export class LedgerService {
  constructor(private readonly pool: Pool = getPool()) {}

  async postDoubleEntry(input: LedgerPosting): Promise<LedgerJournalResult> {
    if (input.amountUsd <= 0) {
      throw new Error('Ledger amount must be positive.');
    }

    if (input.debitAccount === input.creditAccount) {
      throw new Error('Debit and credit account must be different.');
    }

    const journalId = `lj_${randomUUID()}`;
    const amount = Number(input.amountUsd.toFixed(2));

    const client = await this.pool.connect();

    try {
      await client.query('begin');

      await client.query('insert into ledger_journal (journal_id, transfer_id, description) values ($1, $2, $3)', [
        journalId,
        input.transferId,
        input.description ?? null
      ]);

      await client.query(
        `
        insert into ledger_entry (journal_id, transfer_id, account_code, entry_type, amount_usd)
        values ($1, $2, $3, 'debit', $4), ($1, $2, $5, 'credit', $4)
        `,
        [journalId, input.transferId, input.debitAccount, amount, input.creditAccount]
      );

      await client.query('commit');

      return {
        journalId,
        transferId: input.transferId,
        totalDebitUsd: amount,
        totalCreditUsd: amount,
        balanced: true
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getJournalBalance(journalId: string): Promise<LedgerJournalResult | null> {
    const result = await this.pool.query(
      `
      select
        j.journal_id,
        j.transfer_id,
        coalesce(sum(case when e.entry_type = 'debit' then e.amount_usd else 0 end), 0)::numeric as total_debit,
        coalesce(sum(case when e.entry_type = 'credit' then e.amount_usd else 0 end), 0)::numeric as total_credit
      from ledger_journal j
      left join ledger_entry e on e.journal_id = j.journal_id
      where j.journal_id = $1
      group by j.journal_id, j.transfer_id
      `,
      [journalId]
    );

    const row = result.rows[0] as
      | {
          journal_id: string;
          transfer_id: string;
          total_debit: string | number;
          total_credit: string | number;
        }
      | undefined;
    if (!row) {
      return null;
    }

    const totalDebitUsd = Number(row.total_debit);
    const totalCreditUsd = Number(row.total_credit);

    return {
      journalId: row.journal_id,
      transferId: row.transfer_id,
      totalDebitUsd,
      totalCreditUsd,
      balanced: totalDebitUsd === totalCreditUsd
    };
  }
}
