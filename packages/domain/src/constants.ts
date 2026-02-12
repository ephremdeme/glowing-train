export const MAX_TRANSFER_USD = 2000;
export const PAYOUT_SLA_MINUTES = 10;

export const SUPPORTED_TOKENS = ['USDC', 'USDT'] as const;
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

export const SUPPORTED_CHAINS = ['base', 'solana'] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];
