import { FeatureDisabledError } from './errors.js';
import type { PayoutAdapter, PayoutRequest, PayoutResponse } from './types.js';

export class TelebirrPayoutAdapter implements PayoutAdapter {
  constructor(private readonly enabled: boolean) {}

  async initiatePayout(_request: PayoutRequest, _idempotencyKey: string): Promise<PayoutResponse> {
    if (!this.enabled) {
      throw new FeatureDisabledError('Telebirr payout');
    }

    return {
      providerReference: 'telebirr-placeholder',
      acceptedAt: new Date()
    };
  }
}
