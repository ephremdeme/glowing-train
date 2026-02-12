import {
  FeatureDisabledError,
  NonRetryableAdapterError,
  RetryableAdapterError,
  type PayoutAdapter,
  type PayoutMethod,
  type PayoutRequest
} from '@cryptopay/adapters';
import { createHash } from 'node:crypto';
import { isTelebirrEnabled } from '../../feature-flags.js';
import { PayoutRepository } from './repository.js';
import type { InitiatePayoutInput, PayoutResult } from './types.js';

const MAX_RETRIES = 5;

function fingerprint(input: Omit<InitiatePayoutInput, 'idempotencyKey'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function resolveAdapter(method: PayoutMethod, adapters: { bank: PayoutAdapter; telebirr: PayoutAdapter }): PayoutAdapter {
  if (method === 'telebirr') {
    if (!isTelebirrEnabled()) {
      throw new FeatureDisabledError('Telebirr payout');
    }

    return adapters.telebirr;
  }

  return adapters.bank;
}

export class PayoutService {
  constructor(
    private readonly repository: PayoutRepository,
    private readonly adapters: { bank: PayoutAdapter; telebirr: PayoutAdapter }
  ) {}

  async initiatePayout(input: InitiatePayoutInput, now: Date = new Date()): Promise<PayoutResult> {
    const key = `payout:initiate:${input.idempotencyKey}`;
    const requestHash = fingerprint({
      transferId: input.transferId,
      method: input.method,
      recipientAccountRef: input.recipientAccountRef,
      amountEtb: input.amountEtb
    });

    const idempotent = await this.repository.findIdempotency(key);
    if (idempotent) {
      if (idempotent.requestHash !== requestHash) {
        throw new Error('IDEMPOTENCY_CONFLICT');
      }
      return idempotent.responseBody;
    }

    const transfer = await this.repository.findTransferStatus(input.transferId);
    if (!transfer) {
      throw new Error('TRANSFER_NOT_FOUND');
    }

    if (transfer.status !== 'FUNDING_CONFIRMED' && transfer.status !== 'PAYOUT_INITIATED') {
      throw new Error(`TRANSFER_STATE_INVALID:${transfer.status}`);
    }

    const instruction = await this.repository.getOrCreateInstruction(input);
    const adapter = resolveAdapter(input.method, this.adapters);

    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      attempts += 1;

      try {
        const request: PayoutRequest = {
          payoutId: instruction.payoutId,
          transferId: instruction.transferId,
          method: instruction.method,
          recipientAccountRef: instruction.recipientAccountRef,
          amountEtb: instruction.amountEtb
        };

        const response = await adapter.initiatePayout(request, key);

        const result: PayoutResult = {
          status: 'initiated',
          payoutId: instruction.payoutId,
          transferId: instruction.transferId,
          providerReference: response.providerReference,
          attempts
        };

        await this.repository.markInitiated({
          instruction,
          providerReference: response.providerReference,
          attempts
        });

        await this.repository.saveIdempotency({
          key,
          requestHash,
          result,
          now
        });

        return result;
      } catch (error) {
        const retryable = error instanceof RetryableAdapterError;
        if (retryable && attempts < MAX_RETRIES) {
          continue;
        }

        if (error instanceof FeatureDisabledError) {
          throw error;
        }

        if (!retryable && !(error instanceof NonRetryableAdapterError)) {
          throw error;
        }

        const result: PayoutResult = {
          status: 'review_required',
          payoutId: instruction.payoutId,
          transferId: instruction.transferId,
          attempts
        };

        await this.repository.markReviewRequired({
          instruction,
          attempts,
          errorMessage: (error as Error).message
        });

        await this.repository.saveIdempotency({
          key,
          requestHash,
          result,
          now
        });

        return result;
      }
    }

    const fallback: PayoutResult = {
      status: 'review_required',
      payoutId: instruction.payoutId,
      transferId: instruction.transferId,
      attempts: MAX_RETRIES
    };

    await this.repository.markReviewRequired({
      instruction,
      attempts: MAX_RETRIES,
      errorMessage: 'Retry budget exhausted.'
    });

    await this.repository.saveIdempotency({
      key,
      requestHash,
      result: fallback,
      now
    });

    return fallback;
  }
}
