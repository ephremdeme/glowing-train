import { getDb, schema } from '@cryptopay/db';
import { and, desc, eq, ne, or } from 'drizzle-orm';

export class RecipientsRepository {
  private readonly db = getDb();

  async create(input: {
    recipientId: string;
    customerId: string;
    fullName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    bankCode: string;
    phoneE164: string | null;
    countryCode: string;
  }): Promise<typeof schema.recipients.$inferSelect> {
    const rows = await this.db
      .insert(schema.recipients)
      .values({
        recipientId: input.recipientId,
        customerId: input.customerId,
        fullName: input.fullName,
        bankAccountName: input.bankAccountName,
        bankAccountNumber: input.bankAccountNumber,
        bankCode: input.bankCode,
        phoneE164: input.phoneE164,
        countryCode: input.countryCode,
        status: 'active'
      })
      .returning();

    return rows[0] as typeof schema.recipients.$inferSelect;
  }

  async listByCustomer(customerId: string): Promise<Array<typeof schema.recipients.$inferSelect>> {
    return this.db
      .select()
      .from(schema.recipients)
      .where(and(eq(schema.recipients.customerId, customerId), ne(schema.recipients.status, 'deleted')))
      .orderBy(desc(schema.recipients.createdAt));
  }

  async findByIdForCustomer(params: {
    recipientId: string;
    customerId: string;
  }): Promise<(typeof schema.recipients.$inferSelect) | null> {
    const rows = await this.db
      .select()
      .from(schema.recipients)
      .where(
        and(
          eq(schema.recipients.recipientId, params.recipientId),
          eq(schema.recipients.customerId, params.customerId),
          ne(schema.recipients.status, 'deleted')
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async updateForCustomer(params: {
    recipientId: string;
    customerId: string;
    fullName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankCode?: string;
    phoneE164?: string;
    countryCode?: string;
  }): Promise<(typeof schema.recipients.$inferSelect) | null> {
    const rows = await this.db
      .update(schema.recipients)
      .set({
        fullName: params.fullName,
        bankAccountName: params.bankAccountName,
        bankAccountNumber: params.bankAccountNumber,
        bankCode: params.bankCode,
        phoneE164: params.phoneE164,
        countryCode: params.countryCode,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schema.recipients.recipientId, params.recipientId),
          eq(schema.recipients.customerId, params.customerId),
          ne(schema.recipients.status, 'deleted')
        )
      )
      .returning();

    return rows[0] ?? null;
  }

  async softDeleteForCustomer(params: { recipientId: string; customerId: string }): Promise<boolean> {
    const rows = await this.db
      .update(schema.recipients)
      .set({
        status: 'deleted',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(schema.recipients.recipientId, params.recipientId),
          eq(schema.recipients.customerId, params.customerId),
          ne(schema.recipients.status, 'deleted')
        )
      )
      .returning({ recipientId: schema.recipients.recipientId });

    return rows.length > 0;
  }

  async findReceiverKycByRecipient(recipientId: string): Promise<{
    kycStatus: 'approved' | 'pending' | 'rejected';
    nationalIdVerified: boolean;
  } | null> {
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

  async linkReceiverKycToRecipient(params: { receiverId: string; recipientId: string }): Promise<void> {
    await this.db
      .update(schema.receiverKycProfiles)
      .set({ recipientId: params.recipientId, updatedAt: new Date() })
      .where(eq(schema.receiverKycProfiles.receiverId, params.receiverId));
  }
}
