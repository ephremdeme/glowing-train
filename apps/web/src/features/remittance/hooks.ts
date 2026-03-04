'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteSummary } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';
import {
  confirmBaseWalletPayment,
  confirmSolanaWalletPayment,
  createRecipient,
  createTransfer,
  fetchRecipientDetail,
  fetchRecipients,
  fetchSenderProfile,
  fetchTransferStatusDetail,
  type CreateRecipientInput
} from '@/features/remittance/api';

export const remittanceKeys = {
  senderProfile: (authScope: string) => ['remittance', 'sender-profile', authScope] as const,
  recipients: (authScope: string) => ['remittance', 'recipients', authScope] as const,
  recipient: (authScope: string, recipientId: string) => ['remittance', 'recipient', authScope, recipientId] as const,
  transferStatus: (authScope: string, transferId: string) => ['remittance', 'transfer-status', authScope, transferId] as const
};

function tokenScope(token: string): string {
  if (!token) return 'anon';

  // Lightweight non-cryptographic hash so query keys don't store raw bearer tokens.
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return `auth:${(hash >>> 0).toString(16)}`;
}

export function useSenderProfile(token: string) {
  const authScope = tokenScope(token);
  return useQuery({
    queryKey: remittanceKeys.senderProfile(authScope),
    queryFn: () => fetchSenderProfile(token),
    enabled: Boolean(token)
  });
}

export function useRecipients(token: string) {
  const authScope = tokenScope(token);
  return useQuery({
    queryKey: remittanceKeys.recipients(authScope),
    queryFn: () => fetchRecipients(token),
    enabled: Boolean(token)
  });
}

export function useRecipientDetail(token: string, recipientId: string | null | undefined) {
  const authScope = tokenScope(token);
  return useQuery({
    queryKey: remittanceKeys.recipient(authScope, recipientId ?? 'none'),
    queryFn: () => fetchRecipientDetail(token, recipientId as string),
    enabled: Boolean(token && recipientId)
  });
}

export function useCreateRecipient(token: string) {
  const queryClient = useQueryClient();
  const authScope = tokenScope(token);

  return useMutation({
    mutationFn: (input: CreateRecipientInput) => createRecipient(token, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: remittanceKeys.recipients(authScope) });
    }
  });
}

export function useCreateTransfer(token: string) {
  return useMutation({
    mutationFn: (input: { quoteId: string; recipientId: string; quote: QuoteSummary }) => createTransfer(token, input)
  });
}

export function useConfirmSolanaWalletPayment() {
  return useMutation({
    mutationFn: (input: { transferId: string; signature: string; submissionSource?: 'manual_copy_address' | 'wallet_pay' }) =>
      confirmSolanaWalletPayment(readAccessToken() ?? '', input.transferId, input.signature, input.submissionSource)
  });
}

export function useConfirmBaseWalletPayment() {
  return useMutation({
    mutationFn: (input: { transferId: string; txHash: string; submissionSource?: 'manual_copy_address' | 'wallet_pay' }) =>
      confirmBaseWalletPayment(readAccessToken() ?? '', input.transferId, input.txHash, input.submissionSource)
  });
}

export function useTransferStatus(token: string, transferId: string | null | undefined, options?: { refetchInterval?: number }) {
  const authScope = tokenScope(token);
  return useQuery({
    queryKey: remittanceKeys.transferStatus(authScope, transferId ?? 'none'),
    queryFn: () => fetchTransferStatusDetail(token, transferId as string),
    enabled: Boolean(token && transferId),
    ...(options?.refetchInterval !== undefined ? { refetchInterval: options.refetchInterval } : {})
  });
}
