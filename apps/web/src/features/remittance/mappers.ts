import type { MePayload } from '@/lib/contracts';

export type SenderKycUiStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_STARTED';

export function mapSenderKycUiStatus(profile: MePayload | null | undefined): SenderKycUiStatus {
  const status = profile?.senderKyc?.kycStatus?.toUpperCase();
  if (status === 'APPROVED' || status === 'PENDING' || status === 'REJECTED') {
    return status;
  }
  return 'NOT_STARTED';
}

export function isSenderKycApproved(profile: MePayload | null | undefined): boolean {
  return profile?.senderKyc.kycStatus === 'approved';
}

export function senderKycGateMessage(status: SenderKycUiStatus): string | null {
  if (status === 'PENDING') return 'Your identity verification is still being reviewed.';
  if (status === 'REJECTED') return 'Your identity verification was not approved. Please contact support.';
  if (status === 'NOT_STARTED') return 'Complete identity verification before creating a transfer.';
  return null;
}
