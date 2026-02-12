export const PAYOUT_METHODS = ['bank', 'telebirr'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export function isPayoutMethodEnabled(method: PayoutMethod, telebirrEnabled: boolean): boolean {
  if (method === 'telebirr') {
    return telebirrEnabled;
  }

  return true;
}
