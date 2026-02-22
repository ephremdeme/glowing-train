import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { customerAccounts } from './customer.js';

export const idempotencyRecords = pgTable(
  'idempotency_record',
  {
    key: text('key').primaryKey(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (table) => [
    index('idx_idempotency_record_expires_at').on(table.expiresAt)
  ]
);

export const auditLogs = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_audit_log_created_at').on(table.createdAt),
    index('idx_audit_log_entity_created').on(table.entityType, table.entityId, table.createdAt),
    index('idx_audit_log_action_created').on(table.action, table.createdAt)
  ]
);

export const quotes = pgTable(
  'quotes',
  {
    quoteId: text('quote_id').primaryKey(),
    chain: text('chain').notNull(),
    token: text('token').notNull(),
    sendAmountUsd: numeric('send_amount_usd', { precision: 12, scale: 2 }).notNull(),
    fxRateUsdToEtb: numeric('fx_rate_usd_to_etb', { precision: 18, scale: 6 }).notNull(),
    feeUsd: numeric('fee_usd', { precision: 12, scale: 2 }).notNull(),
    recipientAmountEtb: numeric('recipient_amount_etb', { precision: 14, scale: 2 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_quotes_expires_at').on(table.expiresAt)
  ]
);

export const transfers = pgTable(
  'transfers',
  {
    transferId: text('transfer_id').primaryKey(),
    quoteId: text('quote_id')
      .notNull()
      .references(() => quotes.quoteId),
    senderId: text('sender_id').notNull(),
    receiverId: text('receiver_id').notNull(),
    senderKycStatus: text('sender_kyc_status').notNull(),
    receiverKycStatus: text('receiver_kyc_status').notNull(),
    receiverNationalIdVerified: boolean('receiver_national_id_verified').notNull().default(false),
    chain: text('chain').notNull(),
    token: text('token').notNull(),
    sendAmountUsd: numeric('send_amount_usd', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_transfers_sender_created').on(table.senderId, table.createdAt),
    index('idx_transfers_status_created').on(table.status, table.createdAt)
  ]
);

export const transferTransitions = pgTable(
  'transfer_transition',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    transferId: text('transfer_id').notNull(),
    fromState: text('from_state'),
    toState: text('to_state').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata')
  },
  (table) => [
    index('idx_transfer_transition_transfer_occurred').on(table.transferId, table.occurredAt)
  ]
);

export const depositRoutes = pgTable(
  'deposit_routes',
  {
    routeId: text('route_id').primaryKey(),
    transferId: text('transfer_id')
      .notNull()
      .references(() => transfers.transferId, { onDelete: 'cascade' }),
    chain: text('chain').notNull(),
    token: text('token').notNull(),
    depositAddress: text('deposit_address').notNull(),
    depositMemo: text('deposit_memo'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('deposit_routes_transfer_unique').on(table.transferId),
    uniqueIndex('idx_deposit_routes_chain_token_address').on(
      table.chain,
      table.token,
      table.depositAddress
    )
  ]
);

export const onchainFundingEvents = pgTable(
  'onchain_funding_event',
  {
    eventId: text('event_id').primaryKey(),
    chain: text('chain').notNull(),
    token: text('token').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
    transferId: text('transfer_id')
      .notNull()
      .references(() => transfers.transferId),
    depositAddress: text('deposit_address').notNull(),
    amountUsd: numeric('amount_usd', { precision: 12, scale: 2 }).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('onchain_funding_event_transfer_unique').on(table.transferId),
    unique('onchain_funding_event_chain_tx_log_unique').on(table.chain, table.txHash, table.logIndex),
    index('idx_onchain_funding_event_transfer').on(table.transferId)
  ]
);

export const payoutInstructions = pgTable(
  'payout_instruction',
  {
    payoutId: text('payout_id').primaryKey(),
    transferId: text('transfer_id')
      .notNull()
      .references(() => transfers.transferId),
    method: text('method').notNull(),
    recipientAccountRef: text('recipient_account_ref').notNull(),
    amountEtb: numeric('amount_etb', { precision: 14, scale: 2 }).notNull(),
    status: text('status').notNull(),
    providerReference: text('provider_reference'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('payout_instruction_transfer_unique').on(table.transferId),
    index('idx_payout_instruction_transfer').on(table.transferId)
  ]
);

export const payoutStatusEvents = pgTable(
  'payout_status_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    payoutId: text('payout_id')
      .notNull()
      .references(() => payoutInstructions.payoutId, { onDelete: 'cascade' }),
    transferId: text('transfer_id').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_payout_status_event_payout').on(table.payoutId)
  ]
);

export const recipients = pgTable(
  'recipient',
  {
    recipientId: text('recipient_id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customerAccounts.customerId, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    bankAccountName: text('bank_account_name').notNull(),
    bankAccountNumber: text('bank_account_number').notNull(),
    bankCode: text('bank_code').notNull(),
    phoneE164: text('phone_e164'),
    countryCode: text('country_code').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_recipient_customer_id').on(table.customerId)
  ]
);

export const receiverKycProfiles = pgTable(
  'receiver_kyc_profile',
  {
    receiverId: text('receiver_id').primaryKey(),
    recipientId: text('recipient_id').references(() => recipients.recipientId, { onDelete: 'set null' }),
    kycStatus: text('kyc_status').notNull(),
    nationalIdVerified: boolean('national_id_verified').notNull().default(false),
    nationalIdHash: text('national_id_hash'),
    nationalIdEncrypted: jsonb('national_id_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_receiver_kyc_profile_kyc_status').on(table.kycStatus),
    index('idx_receiver_kyc_profile_national_id_hash').on(table.nationalIdHash),
    uniqueIndex('idx_receiver_kyc_profile_recipient_id').on(table.recipientId)
  ]
);

export const ledgerJournals = pgTable('ledger_journal', {
  journalId: text('journal_id').primaryKey(),
  transferId: text('transfer_id').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const ledgerEntries = pgTable(
  'ledger_entry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    journalId: text('journal_id')
      .notNull()
      .references(() => ledgerJournals.journalId, { onDelete: 'cascade' }),
    transferId: text('transfer_id').notNull(),
    accountCode: text('account_code').notNull(),
    entryType: text('entry_type').notNull(),
    amountUsd: numeric('amount_usd', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_ledger_entry_transfer').on(table.transferId),
    index('idx_ledger_entry_journal').on(table.journalId)
  ]
);

export const reconciliationRuns = pgTable(
  'reconciliation_run',
  {
    runId: text('run_id').primaryKey(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    totalTransfers: integer('total_transfers').notNull().default(0),
    totalIssues: integer('total_issues').notNull().default(0),
    status: text('status').notNull(),
    errorMessage: text('error_message')
  },
  (table) => [
    index('idx_reconciliation_run_started_at').on(table.startedAt)
  ]
);

export const reconciliationIssues = pgTable(
  'reconciliation_issue',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => reconciliationRuns.runId, { onDelete: 'cascade' }),
    transferId: text('transfer_id').notNull(),
    issueCode: text('issue_code').notNull(),
    details: jsonb('details'),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_reconciliation_issue_run').on(table.runId),
    index('idx_reconciliation_issue_transfer').on(table.transferId),
    index('idx_reconciliation_issue_detected_at').on(table.detectedAt)
  ]
);

export const watcherCheckpoints = pgTable('watcher_checkpoint', {
  watcherName: text('watcher_name').primaryKey(),
  chain: text('chain').notNull(),
  cursor: text('cursor').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const watcherEventDedupe = pgTable(
  'watcher_event_dedupe',
  {
    eventKey: text('event_key').primaryKey(),
    watcherName: text('watcher_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('idx_watcher_event_dedupe_watcher_created').on(table.watcherName, table.createdAt)
  ]
);
