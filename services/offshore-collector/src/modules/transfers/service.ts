import { assertWithinTransferLimit } from '@cryptopay/domain';
import { createHash, randomUUID } from 'node:crypto';
import type { DepositAddressStrategy } from './deposit-address.js';
import { IdempotencyConflictError, QuoteExpiredError, QuoteNotFoundError, TransferValidationError } from './errors.js';
import type { CreateTransferInput, TransferCreationResult, TransferRepositoryPort } from './types.js';

function computeRequestHash(input: Omit<CreateTransferInput, 'idempotencyKey'>): string {
  const payload = JSON.stringify({
    quoteId: input.quoteId,
    senderId: input.senderId,
    receiverId: input.receiverId,
    senderKycStatus: input.senderKycStatus
  });

  return createHash('sha256').update(payload).digest('hex');
}

/** Simple fallback deposit address strategy. */
const defaultStrategy: DepositAddressStrategy = {
  generateAddress: async () => ({
    depositAddress: `dep_${randomUUID().replaceAll('-', '')}`,
    depositMemo: null,
    routeKind: 'address_route',
    referenceHash: null
  })
};

export class TransferService {
  private readonly depositAddressStrategy: DepositAddressStrategy;

  constructor(
    private readonly repository: TransferRepositoryPort,
    depositAddressStrategy?: DepositAddressStrategy
  ) {
    this.depositAddressStrategy = depositAddressStrategy ?? defaultStrategy;
  }

  async createTransfer(input: CreateTransferInput, now: Date = new Date()): Promise<TransferCreationResult> {
    if (input.senderKycStatus !== 'approved') {
      throw new TransferValidationError('Sender KYC must be approved.');
    }

    const idempotencyStorageKey = `transfer:create:${input.idempotencyKey}`;
    const requestHash = computeRequestHash({
      quoteId: input.quoteId,
      senderId: input.senderId,
      receiverId: input.receiverId,
      senderKycStatus: input.senderKycStatus
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
    const addr = await this.depositAddressStrategy.generateAddress({
      chain: quote.chain,
      token: quote.token,
      transferId
    });

    const created = await this.repository.persistTransferWithRoute({
      transfer: {
        transferId,
        quoteId: quote.quoteId,
        senderId: input.senderId,
        receiverId: input.receiverId,
        senderKycStatus: input.senderKycStatus,
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
        depositAddress: addr.depositAddress,
        depositMemo: addr.depositMemo,
        routeKind: addr.routeKind,
        referenceHash: addr.referenceHash,
        status: 'active' as const
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
