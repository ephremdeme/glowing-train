import { getDb, schema } from '@cryptopay/db';
import { and, asc, desc, eq, or } from 'drizzle-orm';

type TransferStatus = typeof schema.transfers.$inferSelect.status;

export class TransferRepository {
  private readonly db = getDb();

  async listForSender(params: {
    senderId: string;
    status?: TransferStatus;
    limit: number;
  }): Promise<
    Array<{
      transferId: string;
      quoteId: string;
      recipientId: string;
      recipientName: string | null;
      chain: string;
      token: string;
      sendAmountUsd: string;
      status: string;
      depositAddress: string | null;
      createdAt: Date;
    }>
  > {
    return this.db
      .select({
        transferId: schema.transfers.transferId,
        quoteId: schema.transfers.quoteId,
        recipientId: schema.transfers.receiverId,
        recipientName: schema.recipients.fullName,
        chain: schema.transfers.chain,
        token: schema.transfers.token,
        sendAmountUsd: schema.transfers.sendAmountUsd,
        status: schema.transfers.status,
        depositAddress: schema.depositRoutes.depositAddress,
        createdAt: schema.transfers.createdAt
      })
      .from(schema.transfers)
      .leftJoin(schema.recipients, eq(schema.recipients.recipientId, schema.transfers.receiverId))
      .leftJoin(
        schema.depositRoutes,
        and(eq(schema.depositRoutes.transferId, schema.transfers.transferId), eq(schema.depositRoutes.status, 'active'))
      )
      .where(and(eq(schema.transfers.senderId, params.senderId), params.status ? eq(schema.transfers.status, params.status) : undefined))
      .orderBy(desc(schema.transfers.createdAt))
      .limit(params.limit);
  }

  async findDetailForSender(params: { transferId: string; senderId: string }): Promise<
    | {
        transferId: string;
        quoteId: string;
        senderId: string;
        recipientId: string;
        chain: string;
        token: string;
        sendAmountUsd: string;
        status: string;
        createdAt: Date;
        fxRateUsdToEtb: string;
        feeUsd: string;
        recipientAmountEtb: string;
        expiresAt: Date;
        recipientName: string | null;
        bankAccountName: string | null;
        bankAccountNumber: string | null;
        bankCode: string | null;
        phoneE164: string | null;
        depositAddress: string | null;
        depositMemo: string | null;
      }
    | null
  > {
    const rows = await this.db
      .select({
        transferId: schema.transfers.transferId,
        quoteId: schema.transfers.quoteId,
        senderId: schema.transfers.senderId,
        recipientId: schema.transfers.receiverId,
        chain: schema.transfers.chain,
        token: schema.transfers.token,
        sendAmountUsd: schema.transfers.sendAmountUsd,
        status: schema.transfers.status,
        createdAt: schema.transfers.createdAt,
        fxRateUsdToEtb: schema.quotes.fxRateUsdToEtb,
        feeUsd: schema.quotes.feeUsd,
        recipientAmountEtb: schema.quotes.recipientAmountEtb,
        expiresAt: schema.quotes.expiresAt,
        recipientName: schema.recipients.fullName,
        bankAccountName: schema.recipients.bankAccountName,
        bankAccountNumber: schema.recipients.bankAccountNumber,
        bankCode: schema.recipients.bankCode,
        phoneE164: schema.recipients.phoneE164,
        depositAddress: schema.depositRoutes.depositAddress,
        depositMemo: schema.depositRoutes.depositMemo
      })
      .from(schema.transfers)
      .innerJoin(schema.quotes, eq(schema.quotes.quoteId, schema.transfers.quoteId))
      .leftJoin(schema.recipients, eq(schema.recipients.recipientId, schema.transfers.receiverId))
      .leftJoin(
        schema.depositRoutes,
        and(eq(schema.depositRoutes.transferId, schema.transfers.transferId), eq(schema.depositRoutes.status, 'active'))
      )
      .where(and(eq(schema.transfers.transferId, params.transferId), eq(schema.transfers.senderId, params.senderId)))
      .limit(1);

    return rows[0] ?? null;
  }

  async listTransitions(transferId: string): Promise<Array<{ fromState: string | null; toState: string; occurredAt: Date }>> {
    return this.db
      .select({
        fromState: schema.transferTransitions.fromState,
        toState: schema.transferTransitions.toState,
        occurredAt: schema.transferTransitions.occurredAt
      })
      .from(schema.transferTransitions)
      .where(eq(schema.transferTransitions.transferId, transferId))
      .orderBy(asc(schema.transferTransitions.occurredAt));
  }

  async findFunding(transferId: string): Promise<{ eventId: string; txHash: string; amountUsd: string; confirmedAt: Date } | null> {
    const rows = await this.db
      .select({
        eventId: schema.onchainFundingEvents.eventId,
        txHash: schema.onchainFundingEvents.txHash,
        amountUsd: schema.onchainFundingEvents.amountUsd,
        confirmedAt: schema.onchainFundingEvents.confirmedAt
      })
      .from(schema.onchainFundingEvents)
      .where(eq(schema.onchainFundingEvents.transferId, transferId))
      .limit(1);

    return rows[0] ?? null;
  }

  async findPayout(transferId: string): Promise<
    | {
        payoutId: string;
        method: string;
        amountEtb: string;
        status: string;
        providerReference: string | null;
        updatedAt: Date;
      }
    | null
  > {
    const rows = await this.db
      .select({
        payoutId: schema.payoutInstructions.payoutId,
        method: schema.payoutInstructions.method,
        amountEtb: schema.payoutInstructions.amountEtb,
        status: schema.payoutInstructions.status,
        providerReference: schema.payoutInstructions.providerReference,
        updatedAt: schema.payoutInstructions.updatedAt
      })
      .from(schema.payoutInstructions)
      .where(eq(schema.payoutInstructions.transferId, transferId))
      .limit(1);

    return rows[0] ?? null;
  }

  async findSenderKycStatus(customerId: string): Promise<'approved' | 'pending' | 'rejected' | null> {
    const rows = await this.db
      .select({
        kycStatus: schema.senderKycProfiles.kycStatus
      })
      .from(schema.senderKycProfiles)
      .where(eq(schema.senderKycProfiles.customerId, customerId))
      .limit(1);

    return (rows[0]?.kycStatus as 'approved' | 'pending' | 'rejected' | undefined) ?? null;
  }

  async hasActiveRecipient(params: { recipientId: string; customerId: string }): Promise<boolean> {
    const rows = await this.db
      .select({ recipientId: schema.recipients.recipientId })
      .from(schema.recipients)
      .where(
        and(
          eq(schema.recipients.recipientId, params.recipientId),
          eq(schema.recipients.customerId, params.customerId),
          eq(schema.recipients.status, 'active')
        )
      )
      .limit(1);

    return rows.length > 0;
  }

  async findReceiverKyc(recipientId: string): Promise<{ kycStatus: 'approved' | 'pending' | 'rejected'; nationalIdVerified: boolean } | null> {
    const rows = await this.db
      .select({
        kycStatus: schema.receiverKycProfiles.kycStatus,
        nationalIdVerified: schema.receiverKycProfiles.nationalIdVerified
      })
      .from(schema.receiverKycProfiles)
      .where(
        or(
          eq(schema.receiverKycProfiles.recipientId, recipientId),
          eq(schema.receiverKycProfiles.receiverId, recipientId)
        )
      )
      .limit(1);

    return (rows[0] as { kycStatus: 'approved' | 'pending' | 'rejected'; nationalIdVerified: boolean } | undefined) ?? null;
  }
}
