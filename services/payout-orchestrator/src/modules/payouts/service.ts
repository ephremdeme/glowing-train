import {
  NonRetryableAdapterError,
  RetryableAdapterError,
  type PayoutAdapter,
  type PayoutMethod,
  type PayoutRequest
} from '@cryptopay/adapters';
import { withRetry } from '@cryptopay/domain';
import { log } from '@cryptopay/observability';
import { createHash } from 'node:crypto';
import { PayoutRepository } from './repository.js';
import type { InitiatePayoutInput, PayoutResult } from './types.js';

const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 10_000;

function fingerprint(input: Omit<InitiatePayoutInput, 'idempotencyKey'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function resolveAdapter(_method: PayoutMethod, adapters: { bank: PayoutAdapter }): PayoutAdapter {
  return adapters.bank;
}

export class PayoutService {
  constructor(
    private readonly repository: PayoutRepository,
    private readonly adapters: { bank: PayoutAdapter }
  ) { }

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

    const request: PayoutRequest = {
      payoutId: instruction.payoutId,
      transferId: instruction.transferId,
      method: instruction.method,
      recipientAccountRef: instruction.recipientAccountRef,
      amountEtb: instruction.amountEtb
    };

    try {
      const retryResult = await withRetry(
        () => adapter.initiatePayout(request, key),
        {
          maxAttempts: MAX_RETRIES,
          baseDelayMs: RETRY_BASE_DELAY_MS,
          maxDelayMs: RETRY_MAX_DELAY_MS,
          isRetryable: (error) => error instanceof RetryableAdapterError,
          onRetry: (attempt, error, delayMs) => {
            log('warn', 'Payout adapter retry', {
              payoutId: instruction.payoutId,
              transferId: instruction.transferId,
              attempt,
              delayMs,
              error: (error as Error).message
            });
          }
        }
      );

      const result: PayoutResult = {
        status: 'initiated',
        payoutId: instruction.payoutId,
        transferId: instruction.transferId,
        providerReference: retryResult.value.providerReference,
        attempts: retryResult.attempts
      };

      await this.repository.markInitiated({
        instruction,
        providerReference: retryResult.value.providerReference,
        attempts: retryResult.attempts
      });

      await this.repository.saveIdempotency({
        key,
        requestHash,
        result,
        now
      });

      return result;
    } catch (error) {
      if (!(error instanceof RetryableAdapterError) && !(error instanceof NonRetryableAdapterError)) {
        throw error;
      }

      // Retries exhausted or non-retryable — mark for review
      const result: PayoutResult = {
        status: 'review_required',
        payoutId: instruction.payoutId,
        transferId: instruction.transferId,
        attempts: MAX_RETRIES
      };

      await this.repository.markReviewRequired({
        instruction,
        attempts: MAX_RETRIES,
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
}
