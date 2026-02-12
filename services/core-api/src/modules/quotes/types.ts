import type { SupportedChain, SupportedToken } from '@cryptopay/domain';

export interface CreateQuoteInput {
  chain: SupportedChain;
  token: SupportedToken;
  sendAmountUsd: number;
  fxRateUsdToEtb: number;
  feeUsd: number;
  expiresInSeconds: number;
}

export interface QuoteRecord {
  quoteId: string;
  chain: SupportedChain;
  token: SupportedToken;
  sendAmountUsd: number;
  fxRateUsdToEtb: number;
  feeUsd: number;
  recipientAmountEtb: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface QuoteRepositoryPort {
  insert(input: QuoteRecord): Promise<void>;
  findById(quoteId: string): Promise<QuoteRecord | null>;
}
