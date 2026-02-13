import { describe, expect, it } from 'vitest';
import {
  IdempotencyConflictError,
  QuoteExpiredError,
  TransferService,
  TransferValidationError,
  type CreateTransferInput,
  type IdempotencyRecord,
  type QuoteSnapshot,
  type TransferCreationResult,
  type TransferRepositoryPort
} from '../src/modules/transfers/index.js';

class InMemoryTransferRepository implements TransferRepositoryPort {
  private quote: QuoteSnapshot | null = null;
  private idempotency = new Map<string, IdempotencyRecord>();
  private lastCreated: TransferCreationResult | null = null;

  setQuote(quote: QuoteSnapshot): void {
    this.quote = quote;
  }

  async findQuoteById(quoteId: string): Promise<QuoteSnapshot | null> {
    if (this.quote?.quoteId === quoteId) {
      return this.quote;
    }
    return null;
  }

  async findReceiverKycProfile(): Promise<null> {
    return null;
  }

  async findIdempotency(key: string): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(key) ?? null;
  }

  async persistTransferWithRoute(): Promise<TransferCreationResult> {
    const created: TransferCreationResult = {
      transfer: {
        transferId: 'tr_1',
        quoteId: this.quote?.quoteId ?? 'q_missing',
        senderId: 's_1',
        receiverId: 'r_1',
        senderKycStatus: 'approved',
        receiverKycStatus: 'approved',
        receiverNationalIdVerified: true,
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 100,
        status: 'AWAITING_FUNDING',
        createdAt: new Date('2026-02-12T00:00:00.000Z')
      },
      depositRoute: {
        routeId: 'route_1',
        transferId: 'tr_1',
        chain: 'base',
        token: 'USDC',
        depositAddress: 'dep_fake',
        depositMemo: null,
        status: 'active',
        createdAt: new Date('2026-02-12T00:00:00.000Z')
      }
    };

    this.lastCreated = created;
    return created;
  }

  async saveIdempotencyRecord(params: {
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: TransferCreationResult;
    now: Date;
  }): Promise<void> {
    this.idempotency.set(params.key, {
      key: params.key,
      requestHash: params.requestHash,
      responseStatus: params.responseStatus,
      responseBody: params.responseBody,
      expiresAt: new Date(params.now.getTime() + 24 * 3600 * 1000)
    });
  }

}

function buildValidInput(): CreateTransferInput {
  return {
    quoteId: 'q_1',
    senderId: 'sender_1',
    receiverId: 'receiver_1',
    senderKycStatus: 'approved',
    receiverKycStatus: 'approved',
    receiverNationalIdVerified: true,
    idempotencyKey: 'idem-key-001'
  };
}

describe('TransferService unit', () => {
  it('rejects non-approved KYC', async () => {
    const repo = new InMemoryTransferRepository();
    repo.setQuote({
      quoteId: 'q_1',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      expiresAt: new Date('2026-02-12T00:10:00.000Z')
    });

    const service = new TransferService(repo);
    const input = buildValidInput();
    input.receiverKycStatus = 'pending';

    await expect(service.createTransfer(input)).rejects.toBeInstanceOf(TransferValidationError);
  });

  it('returns idempotent response for duplicate request', async () => {
    const repo = new InMemoryTransferRepository();
    repo.setQuote({
      quoteId: 'q_1',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      expiresAt: new Date('2026-02-12T00:10:00.000Z')
    });

    const service = new TransferService(repo);
    const input = buildValidInput();

    const first = await service.createTransfer(input, new Date('2026-02-12T00:00:00.000Z'));
    const second = await service.createTransfer(input, new Date('2026-02-12T00:00:01.000Z'));

    expect(second.transfer.transferId).toBe(first.transfer.transferId);
    expect(second.depositRoute.routeId).toBe(first.depositRoute.routeId);
  });

  it('rejects idempotency key reuse with different payload', async () => {
    const repo = new InMemoryTransferRepository();
    repo.setQuote({
      quoteId: 'q_1',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      expiresAt: new Date('2026-02-12T00:10:00.000Z')
    });

    const service = new TransferService(repo);

    const firstInput = buildValidInput();
    await service.createTransfer(firstInput, new Date('2026-02-12T00:00:00.000Z'));

    const changedPayload = {
      ...firstInput,
      receiverId: 'receiver_2'
    };

    await expect(service.createTransfer(changedPayload, new Date('2026-02-12T00:00:01.000Z'))).rejects.toBeInstanceOf(
      IdempotencyConflictError
    );
  });

  it('rejects expired quotes', async () => {
    const repo = new InMemoryTransferRepository();
    repo.setQuote({
      quoteId: 'q_1',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      expiresAt: new Date('2026-02-12T00:00:00.000Z')
    });

    const service = new TransferService(repo);

    await expect(service.createTransfer(buildValidInput(), new Date('2026-02-12T00:00:01.000Z'))).rejects.toBeInstanceOf(
      QuoteExpiredError
    );
  });
});
