import { readApiMessage } from '@/lib/client-api';
import type { MePayload, QuoteSummary, RecipientDetail, RecipientSummary, TransferSummary } from '@/lib/contracts';

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class RemittanceApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, params: { status: number; code?: string | null | undefined }) {
    super(message);
    this.name = 'RemittanceApiError';
    this.status = params.status;
    this.code = params.code ?? null;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => ({ error: { message: 'Invalid response.' } }));
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit, fallbackMessage: string): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await parseJson(response)) as ApiErrorPayload | T;

  if (!response.ok) {
    throw new RemittanceApiError(readApiMessage(payload, fallbackMessage), {
      status: response.status,
      code: (payload as ApiErrorPayload).error?.code
    });
  }

  return payload as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`
  };
}

export async function fetchSenderProfile(token: string): Promise<MePayload> {
  return requestJson<MePayload>('/api/client/me', { headers: authHeaders(token) }, 'Unable to load sender profile.');
}

export async function fetchRecipients(token: string): Promise<RecipientSummary[]> {
  const payload = await requestJson<{ recipients?: RecipientSummary[] }>(
    '/api/client/recipients',
    { headers: authHeaders(token) },
    'Could not load recipients.'
  );
  return payload.recipients ?? [];
}

export async function fetchRecipientDetail(token: string, recipientId: string): Promise<RecipientDetail> {
  return requestJson<RecipientDetail>(
    `/api/client/recipients/${recipientId}`,
    { headers: authHeaders(token) },
    'Could not load recipient details.'
  );
}

export interface CreateRecipientInput {
  fullName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankCode: string;
  countryCode: string;
  phoneE164?: string;
}

export async function createRecipient(token: string, input: CreateRecipientInput): Promise<{ recipientId: string }> {
  return requestJson<{ recipientId: string }>(
    '/api/client/recipients',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(input)
    },
    'Could not create recipient.'
  );
}

export async function createTransfer(
  token: string,
  input: { quoteId: string; recipientId: string; quote: QuoteSummary }
): Promise<TransferSummary> {
  return requestJson<TransferSummary>(
    '/api/client/transfers',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders(token)
      },
      body: JSON.stringify(input)
    },
    'Could not create transfer.'
  );
}

export async function refreshSenderKycStatus(
  token: string
): Promise<{
  kycStatus?: 'approved' | 'pending' | 'rejected';
  reasonCode?: string | null;
  applicantId?: string | null;
  lastReviewedAt?: string | null;
}> {
  return requestJson('/api/client/kyc/sender/status', { headers: authHeaders(token) }, 'Unable to refresh KYC status.');
}

export async function startSenderKycSession(token: string): Promise<{ token?: string }> {
  return requestJson(
    '/api/client/kyc/sender/sumsub-token',
    { method: 'POST', headers: authHeaders(token) },
    'Could not start verification.'
  );
}
