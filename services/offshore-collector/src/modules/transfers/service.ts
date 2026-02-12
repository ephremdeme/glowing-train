import { assertWithinTransferLimit } from '@cryptopay/domain';
import { createHash, randomUUID } from 'node:crypto';
import { IdempotencyConflictError, QuoteExpiredError, QuoteNotFoundError, TransferValidationError } from './errors.js';
import type { CreateTransferInput, TransferCreationResult, TransferRepositoryPort } from './types.js';

function computeRequestHash(input: Omit<CreateTransferInput, 'idempotencyKey'>): string {
  const payload = JSON.stringify({
    quoteId: input.quoteId,
    senderId: input.senderId,
    receiverId: input.receiverId,
    senderKycStatus: input.senderKycStatus,
    receiverKycStatus: input.receiverKycStatus,
    receiverNationalIdVerified: input.receiverNationalIdVerified
  });

  return createHash('sha256').update(payload).digest('hex');
}

function buildDepositAddress(): string {
  return `dep_${randomUUID().replaceAll('-', '')}`;
}

export class TransferService {
  constructor(private readonly repository: TransferRepositoryPort) {}

  async createTransfer(input: CreateTransferInput, now: Date = new Date()): Promise<TransferCreationResult> {
    if (input.senderKycStatus !== 'approved' || input.receiverKycStatus !== 'approved') {
      throw new TransferValidationError('Sender and receiver KYC must be approved.');
    }

    if (!input.receiverNationalIdVerified) {
      throw new TransferValidationError('Receiver National ID must be verified before transfer creation.');
    }

    const idempotencyStorageKey = `transfer:create:${input.idempotencyKey}`;
    const requestHash = computeRequestHash({
      quoteId: input.quoteId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      senderKycStatus: input.senderKycStatus,
      receiverKycStatus: input.receiverKycStatus,
      receiverNationalIdVerified: input.receiverNationalIdVerified
    });

    const existing = await this.repository.findIdempotency(idempotencyStorageKey);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError(idempotencyStorageKey);
      }
      return existing.responseBody;
    }

    const quote = await this.repository.findQuoteById(input.quoteId);
    if (!quote) {
      throw new QuoteNotFoundError(input.quoteId);
    }

    if (quote.expiresAt.getTime() <= now.getTime()) {
      throw new QuoteExpiredError(quote.quoteId, quote.expiresAt);
    }

    assertWithinTransferLimit(quote.sendAmountUsd);

    const transferId = `tr_${randomUUID()}`;
    const routeId = `route_${randomUUID()}`;

    const created = await this.repository.persistTransferWithRoute({
      transfer: {
        transferId,
        quoteId: quote.quoteId,
        senderId: input.senderId,
        receiverId: input.receiverId,
        senderKycStatus: input.senderKycStatus,
        receiverKycStatus: input.receiverKycStatus,
        receiverNationalIdVerified: input.receiverNationalIdVerified,
        chain: quote.chain,
        token: quote.token,
        sendAmountUsd: quote.sendAmountUsd,
        status: 'AWAITING_FUNDING'
      },
      route: {
        routeId,
        transferId,
        chain: quote.chain,
        token: quote.token,
        depositAddress: buildDepositAddress(),
        depositMemo: null,
        status: 'active'
      }
    });

    await this.repository.saveIdempotencyRecord({
      key: idempotencyStorageKey,
      requestHash,
      responseStatus: 201,
      responseBody: created,
      now
    });

    return created;
  }
}
