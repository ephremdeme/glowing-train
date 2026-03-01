import type { SupportedToken } from '@cryptopay/domain';

export interface VerifyBasePaymentInput {
    transferId: string;
    txHash: string;
}

export interface VerifiedBasePayment {
    verified: true;
    transferId: string;
    chain: 'base';
    token: SupportedToken;
    txHash: string;
    amountUsd: number;
    depositAddress: string;
    confirmedAt: string;
    payerAddress: string;
}

export class BasePaymentVerificationError extends Error {
    code: string;
    status: number;
    retryable: boolean;

    constructor(message: string, params: { code: string; status: number; retryable?: boolean }) {
        super(message);
        this.name = 'BasePaymentVerificationError';
        this.code = params.code;
        this.status = params.status;
        this.retryable = params.retryable ?? false;
    }
}
