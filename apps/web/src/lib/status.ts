import type { UiTransferStatus } from './contracts';

export function mapToUiStatus(backendStatus: string, payoutStatus: string | null): UiTransferStatus {
  if (backendStatus === 'TRANSFER_CREATED') return 'CREATED';
  if (backendStatus === 'AWAITING_FUNDING') return 'AWAITING_DEPOSIT';
  if (backendStatus === 'FUNDING_CONFIRMED') {
    return payoutStatus ? 'SETTLED' : 'CONFIRMING';
  }
  if (backendStatus === 'PAYOUT_INITIATED') return 'PAYOUT_PENDING';
  if (backendStatus === 'PAYOUT_COMPLETED') return 'PAID';
  if (backendStatus === 'PAYOUT_FAILED' || backendStatus === 'PAYOUT_REVIEW_REQUIRED') return 'FAILED';
  return 'CREATED';
}
