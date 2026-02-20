import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { authUsers } from './auth.js';

export const customerAccounts = pgTable('customer_account', {
  customerId: text('customer_id').primaryKey(),
  fullName: text('full_name').notNull(),
  countryCode: text('country_code').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const senderKycProfiles = pgTable(
  'sender_kyc_profile',
  {
    customerId: text('customer_id')
      .primaryKey()
      .references(() => customerAccounts.customerId, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    applicantId: text('applicant_id'),
    kycStatus: text('kyc_status').notNull(),
    reasonCode: text('reason_code'),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusIdx: index('idx_sender_kyc_profile_status').on(table.kycStatus)
  })
);

export const customerAuthLinks = pgTable(
  'customer_auth_link',
  {
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    customerId: text('customer_id')
      .notNull()
      .references(() => customerAccounts.customerId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userUnique: uniqueIndex('idx_customer_auth_link_user_id').on(table.userId),
    customerUnique: uniqueIndex('idx_customer_auth_link_customer_id').on(table.customerId)
  })
);
