import { assertWithinTransferLimit, MAX_TRANSFER_USD } from '@cryptopay/domain';
import { randomUUID } from 'node:crypto';
import { QuoteExpiredError, QuoteNotFoundError, QuoteValidationError } from './errors.js';
import type { CreateQuoteInput, QuoteRecord, QuoteRepositoryPort } from './types.js';

export class QuoteService {
  constructor(private readonly repository: QuoteRepositoryPort) {}

  async createQuote(input: CreateQuoteInput, now: Date = new Date()): Promise<QuoteRecord> {
    assertWithinTransferLimit(input.sendAmountUsd);

    if (input.feeUsd > input.sendAmountUsd) {
      throw new QuoteValidationError('Fee cannot exceed send amount.');
    }

    if (input.expiresInSeconds <= 0) {
      throw new QuoteValidationError('Quote expiry must be greater than zero seconds.');
    }

    if (input.sendAmountUsd > MAX_TRANSFER_USD) {
      throw new QuoteValidationError(`Transfer exceeds USD ${MAX_TRANSFER_USD} limit.`);
    }

    const netUsd = input.sendAmountUsd - input.feeUsd;
    const recipientAmountEtb = Number((netUsd * input.fxRateUsdToEtb).toFixed(2));

    const quote: QuoteRecord = {
      quoteId: `q_${randomUUID()}`,
      chain: input.chain,
      token: input.token,
      sendAmountUsd: input.sendAmountUsd,
      fxRateUsdToEtb: input.fxRateUsdToEtb,
      feeUsd: input.feeUsd,
      recipientAmountEtb,
      expiresAt: new Date(now.getTime() + input.expiresInSeconds * 1000),
      createdAt: now
    };

    await this.repository.insert(quote);
    return quote;
  }

  async getQuote(quoteId: string): Promise<QuoteRecord> {
    const quote = await this.repository.findById(quoteId);
    if (!quote) {
      throw new QuoteNotFoundError(quoteId);
    }
    return quote;
  }

  async getQuoteForTransfer(quoteId: string, now: Date = new Date()): Promise<QuoteRecord> {
    const quote = await this.getQuote(quoteId);
    if (quote.expiresAt.getTime() <= now.getTime()) {
      throw new QuoteExpiredError(quote.quoteId, quote.expiresAt);
    }
    return quote;
  }
}
