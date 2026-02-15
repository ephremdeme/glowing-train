import { z } from 'zod';

export const chainSchema = z.enum(['base', 'solana']);
export const tokenSchema = z.enum(['USDC', 'USDT']);

export const authRegisterSchema = z.object({
  fullName: z.string().min(2),
  countryCode: z.string().min(2).max(2),
  email: z.string().email(),
  password: z.string().min(8)
});

export const authLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().optional()
});

export const recipientCreateSchema = z.object({
  fullName: z.string().min(2),
  bankAccountName: z.string().min(2),
  bankAccountNumber: z.string().min(6),
  bankCode: z.string().min(2),
  phoneE164: z.string().optional(),
  countryCode: z.string().min(2).max(2).default('ET'),
  kycStatus: z.enum(['approved', 'pending', 'rejected']).default('approved'),
  nationalIdVerified: z.boolean().default(true),
  nationalId: z.string().optional()
});

export const recipientUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  bankAccountName: z.string().min(2).optional(),
  bankAccountNumber: z.string().min(6).optional(),
  bankCode: z.string().min(2).optional(),
  phoneE164: z.string().optional(),
  countryCode: z.string().min(2).max(3).optional(),
  nationalId: z.string().optional(),
  nationalIdVerified: z.boolean().optional(),
  kycStatus: z.enum(['approved', 'pending', 'rejected']).optional()
});

export const quoteCreateSchema = z.object({
  chain: chainSchema,
  token: tokenSchema,
  sendAmountUsd: z.number().positive().max(2000),
  fxRateUsdToEtb: z.number().positive(),
  feeUsd: z.number().min(0),
  expiresInSeconds: z.number().int().positive().max(1800).default(300)
});

export const transferCreateSchema = z.object({
  quoteId: z.string().min(1),
  recipientId: z.string().min(1)
});

export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type AuthRegisterInput = z.infer<typeof authRegisterSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type RecipientCreateInput = z.infer<typeof recipientCreateSchema>;
export type RecipientUpdateInput = z.infer<typeof recipientUpdateSchema>;

export interface SessionPayload {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: string;
}

export interface CustomerPayload {
  customerId: string;
  fullName: string;
  countryCode: string;
}

export interface MePayload {
  customerId: string;
  fullName: string;
  countryCode: string;
  status: string;
  senderKyc: {
    kycStatus: 'approved' | 'pending' | 'rejected';
    applicantId: string | null;
    reasonCode: string | null;
    lastReviewedAt: string | null;
  };
}

export interface RecipientSummary {
  recipientId: string;
  fullName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankCode: string;
  phoneE164: string | null;
  countryCode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientDetail extends RecipientSummary {
  receiverKyc: {
    kycStatus: 'approved' | 'pending' | 'rejected';
    nationalIdVerified: boolean;
  };
}

export interface QuoteSummary {
  quoteId: string;
  chain: 'base' | 'solana';
  token: 'USDC' | 'USDT';
  sendAmountUsd: number;
  feeUsd: number;
  fxRateUsdToEtb: number;
  recipientAmountEtb: number;
  expiresAt: string;
}

export interface TransferSummary {
  transferId: string;
  status: string;
  depositAddress: string;
  quote: QuoteSummary;
}

export interface TransferHistoryItem {
  transferId: string;
  quoteId: string;
  recipientId: string;
  recipientName: string | null;
  chain: 'base' | 'solana';
  token: 'USDC' | 'USDT';
  sendAmountUsd: number;
  status: string;
  depositAddress: string | null;
  createdAt: string;
}

export interface TransferDetailPayload {
  transfer: {
    transferId: string;
    quoteId: string;
    senderId: string;
    recipientId: string;
    chain: 'base' | 'solana';
    token: 'USDC' | 'USDT';
    sendAmountUsd: number;
    status: string;
    createdAt: string;
    depositAddress: string | null;
    depositMemo: string | null;
  };
  quote: {
    quoteId: string;
    fxRateUsdToEtb: number;
    feeUsd: number;
    recipientAmountEtb: number;
    expiresAt: string;
  };
  recipient: {
    recipientId: string;
    fullName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankCode: string | null;
    phoneE164: string | null;
  };
  funding: {
    eventId: string;
    txHash: string;
    amountUsd: number;
    confirmedAt: string;
  } | null;
  payout: {
    payoutId: string;
    method: string;
    amountEtb: number;
    status: string;
    providerReference: string | null;
    updatedAt: string;
  } | null;
  transitions: Array<{
    fromState: string | null;
    toState: string;
    occurredAt: string;
  }>;
}

export type UiTransferStatus =
  | 'CREATED'
  | 'AWAITING_DEPOSIT'
  | 'CONFIRMING'
  | 'SETTLED'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'FAILED';

export interface StatusPayload {
  transferId: string;
  backendStatus: string;
  uiStatus: UiTransferStatus;
  createdAt: string | null;
  lastUpdatedAt: string | null;
  payoutStatus: string | null;
  transitions: Array<{
    fromState: string | null;
    toState: string;
    occurredAt: string | null;
  }>;
}

export interface AuthSessionState {
  token: string;
  customerId: string | null;
  fullName: string | null;
  countryCode: string | null;
  lastSyncedAt: string;
}

export interface WalletConnectionState {
  chain: 'base' | 'solana';
  connected: boolean;
  address: string | null;
  connectorName: string | null;
}

export interface FlowDraftState {
  recipientId: string | null;
  recipient: RecipientDetail | null;
  quote: QuoteSummary | null;
  transfer: TransferSummary | null;
  updatedAt: string;
}

export interface LandingEstimateInput {
  chain: 'base' | 'solana';
  token: 'USDC' | 'USDT';
  sendAmountUsd: number;
}

export interface LandingEstimateResult {
  feeUsd: number;
  netUsd: number;
  fxRateUsdToEtb: number;
  recipientAmountEtb: number;
}

export interface QuoteWidgetVisualState {
  busy: boolean;
  highlightedField: 'send' | 'receive' | 'rate' | null;
}

export type StatusChipVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type IllustrationVariant = 'wallet-funding' | 'bank-payout';

export interface GoogleOAuthStartPayload {
  challengeId: string;
  state: string;
  authUrl: string;
}

export interface GoogleOAuthCallbackPayload {
  customer: CustomerPayload;
  session: SessionPayload;
}
