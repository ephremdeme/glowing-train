import { getDb, schema } from '@cryptopay/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

type TransferStatus = typeof schema.transfers.$inferSelect.status;

export type OpsTransferListItem = {
  transferId: string;
  quoteId: string;
  senderId: string;
  receiverId: string;
  chain: string;
  token: string;
  sendAmountUsd: string;
  status: string;
  createdAt: Date;
};

export class OpsRepository {
  private readonly db = getDb();

  async listTransfers(params: { status?: TransferStatus; limit: number }): Promise<OpsTransferListItem[]> {
    return this.db
      .select({
        transferId: schema.transfers.transferId,
        quoteId: schema.transfers.quoteId,
        senderId: schema.transfers.senderId,
        receiverId: schema.transfers.receiverId,
        chain: schema.transfers.chain,
        token: schema.transfers.token,
        sendAmountUsd: schema.transfers.sendAmountUsd,
        status: schema.transfers.status,
        createdAt: schema.transfers.createdAt
      })
      .from(schema.transfers)
      .where(params.status ? eq(schema.transfers.status, params.status) : undefined)
      .orderBy(desc(schema.transfers.createdAt))
      .limit(params.limit);
  }

  async findTransferById(transferId: string): Promise<(typeof schema.transfers.$inferSelect) | null> {
    const rows = await this.db.select().from(schema.transfers).where(eq(schema.transfers.transferId, transferId)).limit(1);
    return rows[0] ?? null;
  }

  async listTransitionsByTransferId(transferId: string): Promise<Array<{ fromState: string | null; toState: string; occurredAt: Date; metadata: unknown }>> {
    return this.db
      .select({
        fromState: schema.transferTransitions.fromState,
        toState: schema.transferTransitions.toState,
        occurredAt: schema.transferTransitions.occurredAt,
        metadata: schema.transferTransitions.metadata
      })
      .from(schema.transferTransitions)
      .where(eq(schema.transferTransitions.transferId, transferId))
      .orderBy(asc(schema.transferTransitions.occurredAt));
  }

  async findPayoutByTransferId(transferId: string): Promise<(typeof schema.payoutInstructions.$inferSelect) | null> {
    const rows = await this.db
      .select()
      .from(schema.payoutInstructions)
      .where(eq(schema.payoutInstructions.transferId, transferId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findFundingByTransferId(transferId: string): Promise<(typeof schema.onchainFundingEvents.$inferSelect) | null> {
    const rows = await this.db
      .select()
      .from(schema.onchainFundingEvents)
      .where(eq(schema.onchainFundingEvents.transferId, transferId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listSlaBreaches(thresholdMinutes: number): Promise<
    Array<{
      transferId: string;
      confirmedAt: Date;
      payoutInitiatedAt: Date;
      minutesToPayout: number;
    }>
  > {
    return this.db
      .select({
        transferId: schema.transfers.transferId,
        confirmedAt: schema.onchainFundingEvents.confirmedAt,
        payoutInitiatedAt: schema.payoutStatusEvents.createdAt,
        minutesToPayout:
          sql<number>`extract(epoch from (${schema.payoutStatusEvents.createdAt} - ${schema.onchainFundingEvents.confirmedAt})) / 60`.as(
            'minutes_to_payout'
          )
      })
      .from(schema.transfers)
      .innerJoin(
        schema.onchainFundingEvents,
        eq(schema.onchainFundingEvents.transferId, schema.transfers.transferId)
      )
      .innerJoin(
        schema.payoutStatusEvents,
        and(
          eq(schema.payoutStatusEvents.transferId, schema.transfers.transferId),
          eq(schema.payoutStatusEvents.toStatus, 'PAYOUT_INITIATED')
        )
      )
      .where(
        sql`(${schema.payoutStatusEvents.createdAt} - ${schema.onchainFundingEvents.confirmedAt}) > (${thresholdMinutes} * interval '1 minute')`
      )
      .orderBy(desc(sql`minutes_to_payout`));
  }

  async insertManualReviewTransition(params: {
    transferId: string;
    fromState: string;
    actorId: string;
  }): Promise<void> {
    await this.db.insert(schema.transferTransitions).values({
      transferId: params.transferId,
      fromState: params.fromState,
      toState: params.fromState,
      metadata: {
        note: 'Manual review acknowledgment',
        actor: params.actorId
      }
    });
  }
}
