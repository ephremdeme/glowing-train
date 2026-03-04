import type { SupportedChain, SupportedToken } from '@cryptopay/domain';

export type FundingAmountDecision =
  | 'exact'
  | 'tolerance'
  | 'overpay_adjusted'
  | 'underpay_rejected'
  | 'over_limit_rejected';

export interface FundingConfirmedInput {
  eventId: string;
  chain: SupportedChain;
  token: SupportedToken;
  txHash: string;
  logIndex: number;
  transferId?: string;
  depositAddress: string;
  amountUsd: number;
  confirmedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface RouteMatch {
  transferId: string;
  status: string;
}

export interface FundingResult {
  status:
    | 'confirmed'
    | 'duplicate'
    | 'route_not_found'
    | 'invalid_state'
    | 'amount_underpaid'
    | 'amount_over_limit';
  transferId?: string;
  amountDecision?: FundingAmountDecision;
  expectedAmountUsd?: number;
  receivedAmountUsd?: number;
  adjustedSendAmountUsd?: number;
}
