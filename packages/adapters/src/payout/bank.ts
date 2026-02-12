import { NonRetryableAdapterError, RetryableAdapterError } from './errors.js';
import type { PayoutAdapter, PayoutRequest, PayoutResponse } from './types.js';

export type BankTransport = (request: PayoutRequest, idempotencyKey: string) => Promise<PayoutResponse>;

export class BankPayoutAdapter implements PayoutAdapter {
  constructor(private readonly transport: BankTransport) {}

  async initiatePayout(request: PayoutRequest, idempotencyKey: string): Promise<PayoutResponse> {
    try {
      return await this.transport(request, idempotencyKey);
    } catch (error) {
      if (error instanceof RetryableAdapterError || error instanceof NonRetryableAdapterError) {
        throw error;
      }

      throw new RetryableAdapterError(`Bank adapter temporary failure: ${(error as Error).message}`);
    }
  }
}
