import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ReconciliationRepository } from './repository.js';
import { buildReconciliationCsv, type ReconciliationCsvRow } from '../reporting/csv.js';

type TransferSnapshot = {
  transfer_id: string;
  quote_id: string;
  status: string;
  chain: string;
  token: string;
  expected_etb: number | null;
  funded_amount_usd: number | null;
  payout_status: string | null;
  debit_total: number;
  credit_total: number;
};

const OPEN_TRANSFER_STATUSES = ['AWAITING_FUNDING', 'FUNDING_CONFIRMED', 'PAYOUT_INITIATED', 'PAYOUT_REVIEW_REQUIRED'] as const;

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
  constructor(private readonly repository: ReconciliationRepository = new ReconciliationRepository()) {}

  async runOnce(outputCsvPath?: string): Promise<{ runId: string; issueCount: number; csv: string }> {
    const runId = `recon_${randomUUID()}`;
    const startedAt = new Date();

    await this.repository.createRun({
      runId,
      startedAt
    });

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

    await this.repository.insertIssues(runId, issues);

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

    await this.repository.completeRun({
      runId,
      finishedAt: new Date(),
      totalTransfers: snapshots.length,
      totalIssues: issues.length
    });

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
    const targets = await this.repository.listTargetTransfers({
      openStatuses: OPEN_TRANSFER_STATUSES,
      lookbackDays: params.lookbackDays,
      pageSize: params.pageSize,
      offset: params.offset
    });

    if (targets.length === 0) {
      return [];
    }

    const transferIds = targets.map((target) => target.transferId);
    const quoteIds = [...new Set(targets.map((target) => target.quoteId))];
    const supplements = await this.repository.fetchSupplements({
      transferIds,
      quoteIds
    });

    return targets.map((target) => {
      const quote = supplements.quoteById.get(target.quoteId);
      const funding = supplements.fundingByTransferId.get(target.transferId);
      const payout = supplements.payoutByTransferId.get(target.transferId);
      const ledger = supplements.ledgerByTransferId.get(target.transferId);

      return {
        transfer_id: target.transferId,
        quote_id: target.quoteId,
        status: target.status,
        chain: target.chain,
        token: target.token,
        expected_etb: quote ? Number(quote.expectedEtb) : null,
        funded_amount_usd: funding ? Number(funding.fundedAmountUsd) : null,
        payout_status: payout?.payoutStatus ?? null,
        debit_total: ledger?.debitTotal ?? 0,
        credit_total: ledger?.creditTotal ?? 0
      };
    });
  }
}
