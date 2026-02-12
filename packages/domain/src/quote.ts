import { z } from 'zod';
import { MAX_TRANSFER_USD, SUPPORTED_CHAINS, SUPPORTED_TOKENS } from './constants.js';

export const QuoteSchema = z.object({
  quoteId: z.string().min(1),
  chain: z.enum(SUPPORTED_CHAINS),
  token: z.enum(SUPPORTED_TOKENS),
  sendAmountUsd: z.number().positive().max(MAX_TRANSFER_USD),
  fxRateUsdToEtb: z.number().positive(),
  feeUsd: z.number().min(0),
  expiresAt: z.date()
});

export type Quote = z.infer<typeof QuoteSchema>;

export function assertWithinTransferLimit(sendAmountUsd: number): void {
  if (sendAmountUsd > MAX_TRANSFER_USD) {
    throw new Error(`Transfer amount exceeds limit of USD ${MAX_TRANSFER_USD}.`);
  }
}

export function isQuoteExpired(quote: Quote, now: Date = new Date()): boolean {
  return quote.expiresAt.getTime() <= now.getTime();
}
