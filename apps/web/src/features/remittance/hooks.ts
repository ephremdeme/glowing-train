'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuoteSummary } from '@/lib/contracts';
import {
  createRecipient,
  createTransfer,
  fetchRecipientDetail,
  fetchRecipients,
  fetchSenderProfile,
  type CreateRecipientInput
} from '@/features/remittance/api';

export const remittanceKeys = {
  senderProfile: (authScope: string) => ['remittance', 'sender-profile', authScope] as const,
  recipients: (authScope: string) => ['remittance', 'recipients', authScope] as const,
  recipient: (authScope: string, recipientId: string) => ['remittance', 'recipient', authScope, recipientId] as const
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
