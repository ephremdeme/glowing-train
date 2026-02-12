export type PayoutMethod = 'bank' | 'telebirr';

export interface PayoutRequest {
  payoutId: string;
  transferId: string;
  method: PayoutMethod;
  recipientAccountRef: string;
  amountEtb: number;
}

export interface PayoutResponse {
  providerReference: string;
  acceptedAt: Date;
}

export interface PayoutAdapter {
  initiatePayout(request: PayoutRequest, idempotencyKey: string): Promise<PayoutResponse>;
}
