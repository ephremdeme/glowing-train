import type { PayoutMethod } from '@cryptopay/adapters';

export interface InitiatePayoutInput {
  transferId: string;
  method: PayoutMethod;
  recipientAccountRef: string;
  amountEtb: number;
  idempotencyKey: string;
}

export interface PayoutInstructionRecord {
  payoutId: string;
  transferId: string;
  method: PayoutMethod;
  recipientAccountRef: string;
  amountEtb: number;
  status: 'PENDING' | 'PAYOUT_INITIATED' | 'PAYOUT_REVIEW_REQUIRED';
  providerReference: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface PayoutResult {
  status: 'initiated' | 'review_required';
  payoutId: string;
  transferId: string;
  providerReference?: string;
  attempts: number;
}

export interface TransferStatusSnapshot {
  transferId: string;
  status: string;
}

export interface IdempotencySnapshot {
  key: string;
  requestHash: string;
  responseBody: PayoutResult;
}
