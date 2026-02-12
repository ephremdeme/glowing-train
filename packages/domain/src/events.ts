import type { SupportedChain, SupportedToken } from './constants.js';

export interface FundingConfirmedEvent {
  eventId: string;
  chain: SupportedChain;
  token: SupportedToken;
  txHash: string;
  logIndex: number;
  depositAddress: string;
  amountUsd: number;
  confirmedAt: Date;
}

export interface FundingConfirmedResult {
  status: 'confirmed' | 'duplicate' | 'route_not_found' | 'invalid_state';
  transferId?: string;
}
