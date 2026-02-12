import { describe, expect, it } from 'vitest';
import { MAX_TRANSFER_USD } from '../src/constants.js';
import { assertWithinTransferLimit, isQuoteExpired, type Quote } from '../src/quote.js';

describe('quote domain rules', () => {
  it('enforces USD 2,000 transfer cap', () => {
    expect(() => assertWithinTransferLimit(MAX_TRANSFER_USD + 1)).toThrow(/exceeds limit/);
  });

  it('detects quote expiry correctly', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expired: Quote = {
      quoteId: 'q_1',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      fxRateUsdToEtb: 140,
      feeUsd: 1,
      expiresAt: new Date('2025-12-31T23:59:59.000Z')
    };

    expect(isQuoteExpired(expired, now)).toBe(true);
  });
});
