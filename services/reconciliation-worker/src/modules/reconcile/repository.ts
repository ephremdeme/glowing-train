import { getDb, schema } from '@cryptopay/db';
import { asc, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';

type TransferStatus = typeof schema.transfers.$inferSelect.status;

export type TargetTransferRow = {
  transferId: string;
  quoteId: string;
  status: string;
  chain: string;
  token: string;
};

export type SnapshotSupplement = {
  quoteById: Map<string, { expectedEtb: string }>;
  fundingByTransferId: Map<string, { fundedAmountUsd: string }>;
  payoutByTransferId: Map<string, { payoutStatus: string }>;
  ledgerByTransferId: Map<string, { debitTotal: number; creditTotal: number }>;
};

export class ReconciliationRepository {
  private readonly db = getDb();

  async createRun(params: { runId: string; startedAt: Date }): Promise<void> {
    await this.db.insert(schema.reconciliationRuns).values({
      runId: params.runId,
      startedAt: params.startedAt,
      status: 'running'
    });
  }

  async completeRun(params: {
    runId: string;
    finishedAt: Date;
    totalTransfers: number;
    totalIssues: number;
  }): Promise<void> {
    await this.db
      .update(schema.reconciliationRuns)
      .set({
        finishedAt: params.finishedAt,
        totalTransfers: params.totalTransfers,
        totalIssues: params.totalIssues,
        status: 'completed'
      })
      .where(eq(schema.reconciliationRuns.runId, params.runId));
  }

  async insertIssues(
    runId: string,
    issues: Array<{ transferId: string; issueCode: string; details: Record<string, unknown> }>
  ): Promise<void> {
    if (issues.length === 0) {
      return;
    }

    await this.db.insert(schema.reconciliationIssues).values(
      issues.map((issue) => ({
        runId,
        transferId: issue.transferId,
        issueCode: issue.issueCode,
        details: issue.details
      }))
    );
  }

  async listTargetTransfers(params: {
    openStatuses: readonly TransferStatus[];
    lookbackDays: number;
    pageSize: number;
    offset: number;
  }): Promise<TargetTransferRow[]> {
    return this.db
      .select({
        transferId: schema.transfers.transferId,
        quoteId: schema.transfers.quoteId,
        status: schema.transfers.status,
        chain: schema.transfers.chain,
        token: schema.transfers.token
      })
      .from(schema.transfers)
      .where(
        or(
          inArray(schema.transfers.status, params.openStatuses),
          gte(schema.transfers.createdAt, sql`now() - (${params.lookbackDays} * interval '1 day')`)
        )
      )
      .orderBy(desc(schema.transfers.createdAt))
      .limit(params.pageSize)
      .offset(params.offset);
  }

  async fetchSupplements(params: {
    transferIds: string[];
    quoteIds: string[];
  }): Promise<SnapshotSupplement> {
    if (params.transferIds.length === 0) {
      return {
        quoteById: new Map(),
        fundingByTransferId: new Map(),
        payoutByTransferId: new Map(),
        ledgerByTransferId: new Map()
      };
    }

    const [quoteRows, fundingRows, payoutRows, ledgerRows] = await Promise.all([
      params.quoteIds.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              quoteId: schema.quotes.quoteId,
              expectedEtb: schema.quotes.recipientAmountEtb
            })
            .from(schema.quotes)
            .where(inArray(schema.quotes.quoteId, params.quoteIds)),
      this.db
        .select({
          transferId: schema.onchainFundingEvents.transferId,
          fundedAmountUsd: schema.onchainFundingEvents.amountUsd
        })
        .from(schema.onchainFundingEvents)
        .where(inArray(schema.onchainFundingEvents.transferId, params.transferIds)),
      this.db
        .select({
          transferId: schema.payoutInstructions.transferId,
          payoutStatus: schema.payoutInstructions.status
        })
        .from(schema.payoutInstructions)
        .where(inArray(schema.payoutInstructions.transferId, params.transferIds)),
      this.db
        .select({
          transferId: schema.ledgerEntries.transferId,
          debitTotal:
            sql<string>`coalesce(sum(case when ${schema.ledgerEntries.entryType} = 'debit' then ${schema.ledgerEntries.amountUsd} else 0 end), 0)::numeric`.as(
              'debit_total'
            ),
          creditTotal:
            sql<string>`coalesce(sum(case when ${schema.ledgerEntries.entryType} = 'credit' then ${schema.ledgerEntries.amountUsd} else 0 end), 0)::numeric`.as(
              'credit_total'
            )
        })
        .from(schema.ledgerEntries)
        .where(inArray(schema.ledgerEntries.transferId, params.transferIds))
        .groupBy(schema.ledgerEntries.transferId)
    ]);

    const quoteById = new Map(quoteRows.map((row) => [row.quoteId, { expectedEtb: row.expectedEtb }]));
    const fundingByTransferId = new Map(
      fundingRows.map((row) => [row.transferId, { fundedAmountUsd: row.fundedAmountUsd }])
    );
    const payoutByTransferId = new Map(
      payoutRows.map((row) => [row.transferId, { payoutStatus: row.payoutStatus }])
    );
    const ledgerByTransferId = new Map(
      ledgerRows.map((row) => [
        row.transferId,
        {
          debitTotal: Number(row.debitTotal),
          creditTotal: Number(row.creditTotal)
        }
      ])
    );

    return {
      quoteById,
      fundingByTransferId,
      payoutByTransferId,
      ledgerByTransferId
    };
  }

  async findRunById(runId: string): Promise<(typeof schema.reconciliationRuns.$inferSelect) | null> {
    const rows = await this.db
      .select()
      .from(schema.reconciliationRuns)
      .where(eq(schema.reconciliationRuns.runId, runId))
      .limit(1);

    return rows[0] ?? null;
  }

  async listIssuesByRunId(runId: string): Promise<Array<typeof schema.reconciliationIssues.$inferSelect>> {
    return this.db
      .select()
      .from(schema.reconciliationIssues)
      .where(eq(schema.reconciliationIssues.runId, runId))
      .orderBy(asc(schema.reconciliationIssues.id));
  }

  async listIssues(params: {
    since: Date | null;
    limit: number;
  }): Promise<Array<typeof schema.reconciliationIssues.$inferSelect>> {
    return this.db
      .select()
      .from(schema.reconciliationIssues)
      .where(params.since ? gte(schema.reconciliationIssues.detectedAt, params.since) : undefined)
      .orderBy(desc(schema.reconciliationIssues.detectedAt))
      .limit(params.limit);
  }
}
