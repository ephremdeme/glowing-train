export const PAYOUT_METHODS = ['bank'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export function isPayoutMethodEnabled(method: PayoutMethod): boolean {
  return method === 'bank';
}
