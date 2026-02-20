import { getPool } from '@cryptopay/db';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { buildReconciliationCsv, type ReconciliationCsvRow } from '../reporting/csv.js';

type Pool = ReturnType<typeof getPool>;

type TransferSnapshot = {
  transfer_id: string;
  quote_id: string | null;
  status: string;
  chain: string | null;
  token: string | null;
  expected_etb: number | null;
  funded_amount_usd: number | null;
  payout_status: string | null;
  debit_total: number;
  credit_total: number;
};

const OPEN_TRANSFER_STATUSES = ['AWAITING_FUNDING', 'FUNDING_CONFIRMED', 'PAYOUT_INITIATED', 'REVIEW_REQUIRED'] as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

export class ReconciliationService {
  constructor(private readonly pool: Pool = getPool()) {}

  async runOnce(outputCsvPath?: string): Promise<{ runId: string; issueCount: number; csv: string }> {
    const runId = `recon_${randomUUID()}`;
    const startedAt = new Date();

    await this.pool.query(
      `
      insert into reconciliation_run (run_id, started_at, status)
      values ($1, $2, 'running')
      `,
      [runId, startedAt]
    );

    const snapshots = await this.fetchSnapshots();
    const issues: Array<{ transferId: string; issueCode: string; details: Record<string, unknown> }> = [];

    for (const row of snapshots) {
      const ledgerBalanced = Number(row.debit_total) === Number(row.credit_total);

      if (row.status !== 'AWAITING_FUNDING' && row.funded_amount_usd === null) {
        issues.push({
          transferId: row.transfer_id,
          issueCode: 'MISSING_FUNDING_EVENT',
          details: { transferStatus: row.status }
        });
      }

      if (!ledgerBalanced) {
        issues.push({
          transferId: row.transfer_id,
          issueCode: 'LEDGER_IMBALANCE',
          details: {
            debitTotal: row.debit_total,
            creditTotal: row.credit_total
          }
        });
      }

      if (row.status === 'PAYOUT_COMPLETED' && row.payout_status !== 'PAYOUT_INITIATED') {
        issues.push({
          transferId: row.transfer_id,
          issueCode: 'PAYOUT_STATUS_MISMATCH',
          details: {
            transferStatus: row.status,
            payoutStatus: row.payout_status
          }
        });
      }

      if (row.status === 'PAYOUT_INITIATED' && row.payout_status === null) {
        issues.push({
          transferId: row.transfer_id,
          issueCode: 'MISSING_PAYOUT_RECORD',
          details: { transferStatus: row.status }
        });
      }
    }

    if (issues.length > 0) {
      await this.pool.query(
        `
        insert into reconciliation_issue (run_id, transfer_id, issue_code, details)
        select $1, x.transfer_id, x.issue_code, x.details
        from jsonb_to_recordset($2::jsonb) as x(transfer_id text, issue_code text, details jsonb)
        `,
        [
          runId,
          JSON.stringify(
            issues.map((issue) => ({
              transfer_id: issue.transferId,
              issue_code: issue.issueCode,
              details: issue.details
            }))
          )
        ]
      );
    }

    const csvRows: ReconciliationCsvRow[] = issues.map((issue) => {
      const transfer = snapshots.find((s) => s.transfer_id === issue.transferId);
      return {
        transfer_id: issue.transferId,
        quote_id: transfer?.quote_id ?? null,
        chain: transfer?.chain ?? null,
        token: transfer?.token ?? null,
        funded_amount_usd: transfer?.funded_amount_usd ?? null,
        expected_etb: transfer?.expected_etb ?? null,
        payout_status: transfer?.payout_status ?? null,
        ledger_balanced: Number(transfer?.debit_total ?? 0) === Number(transfer?.credit_total ?? 0),
        issue_code: issue.issueCode,
        detected_at: new Date().toISOString()
      };
    });

    const csv = buildReconciliationCsv(csvRows);

    if (outputCsvPath) {
      await writeFile(outputCsvPath, csv, 'utf8');
    }

    await this.pool.query(
      `
      update reconciliation_run
      set finished_at = $2,
          total_transfers = $3,
          total_issues = $4,
          status = 'completed'
      where run_id = $1
      `,
      [runId, new Date(), snapshots.length, issues.length]
    );

    return {
      runId,
      issueCount: issues.length,
      csv
    };
  }

  private async fetchSnapshots(): Promise<TransferSnapshot[]> {
    const lookbackDays = parsePositiveInt(process.env.RECONCILIATION_LOOKBACK_DAYS, 14);
    const pageSize = Math.min(parsePositiveInt(process.env.RECONCILIATION_PAGE_SIZE, 500), 2_000);
    const snapshots: TransferSnapshot[] = [];
    let offset = 0;

    while (true) {
      const page = await this.fetchSnapshotPage({
        lookbackDays,
        pageSize,
        offset
      });
      snapshots.push(...page);

      if (page.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return snapshots;
  }

  private async fetchSnapshotPage(params: {
    lookbackDays: number;
    pageSize: number;
    offset: number;
  }): Promise<TransferSnapshot[]> {
    const result = await this.pool.query(
      `
      with target_transfers as (
        select
          t.transfer_id,
          t.quote_id,
          t.status,
          t.chain,
          t.token
        from transfers t
        where t.status = any($1::text[])
           or t.created_at >= now() - ($2::int * interval '1 day')
        order by t.created_at desc
        limit $3
        offset $4
      ),
      ledger as (
        select
          le.transfer_id,
          coalesce(sum(case when le.entry_type = 'debit' then le.amount_usd else 0 end), 0)::numeric as debit_total,
          coalesce(sum(case when le.entry_type = 'credit' then le.amount_usd else 0 end), 0)::numeric as credit_total
        from ledger_entry le
        join target_transfers tt on tt.transfer_id = le.transfer_id
        group by le.transfer_id
      )
      select
        tt.transfer_id,
        tt.quote_id,
        tt.status,
        tt.chain,
        tt.token,
        q.recipient_amount_etb as expected_etb,
        ofe.amount_usd as funded_amount_usd,
        pi.status as payout_status,
        coalesce(l.debit_total, 0) as debit_total,
        coalesce(l.credit_total, 0) as credit_total
      from target_transfers tt
      left join quotes q on q.quote_id = tt.quote_id
      left join onchain_funding_event ofe on ofe.transfer_id = tt.transfer_id
      left join payout_instruction pi on pi.transfer_id = tt.transfer_id
      left join ledger l on l.transfer_id = tt.transfer_id
      `,
      [OPEN_TRANSFER_STATUSES, params.lookbackDays, params.pageSize, params.offset]
    );

    return result.rows as TransferSnapshot[];
  }
}
