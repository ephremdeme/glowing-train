import { describe, expect, it } from 'vitest';
import { QuoteExpiredError, QuoteService, QuoteValidationError, type QuoteRecord, type QuoteRepositoryPort } from '../src/modules/quotes/index.js';

class InMemoryQuoteRepository implements QuoteRepositoryPort {
  private readonly map = new Map<string, QuoteRecord>();

  async insert(input: QuoteRecord): Promise<void> {
    this.map.set(input.quoteId, input);
  }

  async findById(quoteId: string): Promise<QuoteRecord | null> {
    return this.map.get(quoteId) ?? null;
  }
}

describe('QuoteService unit', () => {
  it('creates quote with locked recipient amount and expiry', async () => {
    const service = new QuoteService(new InMemoryQuoteRepository());
    const now = new Date('2026-02-12T00:00:00.000Z');

    const quote = await service.createQuote(
      {
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 200,
        fxRateUsdToEtb: 135.5,
        feeUsd: 2,
        expiresInSeconds: 300
      },
      now
    );

    expect(quote.recipientAmountEtb).toBe(26829);
    expect(quote.expiresAt.toISOString()).toBe('2026-02-12T00:05:00.000Z');
  });

  it('rejects transfers above USD 2,000', async () => {
    const service = new QuoteService(new InMemoryQuoteRepository());

    await expect(
      service.createQuote({
        chain: 'base',
        token: 'USDT',
        sendAmountUsd: 2001,
        fxRateUsdToEtb: 130,
        feeUsd: 1,
        expiresInSeconds: 60
      })
    ).rejects.toThrow(/exceeds limit/);
  });

  it('throws explicit QUOTE_EXPIRED error for expired quotes', async () => {
    const service = new QuoteService(new InMemoryQuoteRepository());
    const createdAt = new Date('2026-02-12T00:00:00.000Z');

    const quote = await service.createQuote(
      {
        chain: 'solana',
        token: 'USDC',
        sendAmountUsd: 100,
        fxRateUsdToEtb: 140,
        feeUsd: 1,
        expiresInSeconds: 30
      },
      createdAt
    );

    await expect(service.getQuoteForTransfer(quote.quoteId, new Date('2026-02-12T00:01:00.000Z'))).rejects.toBeInstanceOf(
      QuoteExpiredError
    );

    await expect(service.getQuoteForTransfer(quote.quoteId, new Date('2026-02-12T00:01:00.000Z'))).rejects.toMatchObject({
      code: 'QUOTE_EXPIRED'
    });
  });

  it('rejects fee above send amount', async () => {
    const service = new QuoteService(new InMemoryQuoteRepository());

    await expect(
      service.createQuote({
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 50,
        fxRateUsdToEtb: 130,
        feeUsd: 51,
        expiresInSeconds: 120
      })
    ).rejects.toBeInstanceOf(QuoteValidationError);
  });
});
