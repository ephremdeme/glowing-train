import type { SupportedChain, SupportedToken } from '@cryptopay/domain';

export interface FundingConfirmedInput {
  eventId: string;
  chain: SupportedChain;
  token: SupportedToken;
  txHash: string;
  logIndex: number;
  depositAddress: string;
  amountUsd: number;
  confirmedAt: Date;
}

export interface RouteMatch {
  transferId: string;
  status: string;
}

export interface FundingResult {
  status: 'confirmed' | 'duplicate' | 'route_not_found' | 'invalid_state';
  transferId?: string;
}
