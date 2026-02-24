import type { SupportedToken } from '@cryptopay/domain';

export interface VerifySolanaPaymentInput {
  transferId: string;
  txHash: string;
}

export interface VerifiedSolanaPayment {
  verified: true;
  transferId: string;
  chain: 'solana';
  token: SupportedToken;
  txHash: string;
  amountUsd: number;
  depositAddress: string;
  confirmedAt: string;
  referenceHash: string;
  payerAddress: string;
  paymentId: string;
}

export class SolanaPaymentVerificationError extends Error {
  code: string;
  status: number;
  retryable: boolean;

  constructor(message: string, params: { code: string; status: number; retryable?: boolean }) {
    super(message);
    this.name = 'SolanaPaymentVerificationError';
    this.code = params.code;
    this.status = params.status;
    this.retryable = params.retryable ?? false;
  }
}

