import { readApiMessage, readAuthMessage } from '@/lib/client-api';
import type {
  BasePaymentConfirmationPayload,
  MePayload,
  QuoteSummary,
  RecipientDetail,
  RecipientSummary,
  SolanaPaymentConfirmationPayload,
  TransferDetailPayload,
  TransferSummary,
  UiTransferStatus
} from '@/lib/contracts';
import { exchangeAccessToken } from '@/lib/session';
type PaymentSubmissionSource = 'manual_copy_address' | 'wallet_pay';

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

function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function withBearerToken(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return { ...init, headers };
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage: string,
  options?: { token?: string }
): Promise<T> {
  let activeToken = options?.token ?? '';
  let retriedAfterRefresh = false;

  while (true) {
    const requestInit = activeToken ? withBearerToken(init, activeToken) : init;
    const response = await fetch(input, requestInit);
    const payload = (await parseJson(response)) as ApiErrorPayload | T;

    if (response.ok) {
      return payload as T;
    }

    if (isAuthStatus(response.status) && !retriedAfterRefresh) {
      retriedAfterRefresh = true;
      try {
        const exchanged = await exchangeAccessToken();
        activeToken = exchanged.token;
        continue;
      } catch {
        // Fall through to normalized auth error below.
      }
    }

    const message = isAuthStatus(response.status)
      ? readAuthMessage(payload, fallbackMessage)
      : readApiMessage(payload, fallbackMessage);

    throw new RemittanceApiError(message, {
      status: response.status,
      code: (payload as ApiErrorPayload).error?.code
    });
  }
}

export async function fetchSenderProfile(token: string): Promise<MePayload> {
  return requestJson<MePayload>('/api/client/me', {}, 'Unable to load sender profile.', { token });
}

export async function fetchRecipients(token: string): Promise<RecipientSummary[]> {
  const payload = await requestJson<{ recipients?: RecipientSummary[] }>(
    '/api/client/recipients',
    {},
    'Could not load recipients.',
    { token }
  );
  return payload.recipients ?? [];
}

export async function fetchRecipientDetail(token: string, recipientId: string): Promise<RecipientDetail> {
  return requestJson<RecipientDetail>(
    `/api/client/recipients/${recipientId}`,
    {},
    'Could not load recipient details.',
    { token }
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
        'content-type': 'application/json'
      },
      body: JSON.stringify(input)
    },
    'Could not create recipient.',
    { token }
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
        'content-type': 'application/json'
      },
      body: JSON.stringify(input)
    },
    'Could not create transfer.',
    { token }
  );
}

export type TransferStatusDetail = TransferDetailPayload & {
  backendStatus: string;
  uiStatus: UiTransferStatus;
};

export async function fetchTransferStatusDetail(token: string, transferId: string): Promise<TransferStatusDetail> {
  return requestJson<TransferStatusDetail>(
    `/api/client/transfers/${transferId}`,
    { cache: 'no-store' },
    'Unable to load transfer status.',
    { token }
  );
}

export async function confirmSolanaWalletPayment(
  token: string,
  transferId: string,
  signature: string,
  submissionSource?: PaymentSubmissionSource
): Promise<SolanaPaymentConfirmationPayload> {
  return requestJson<SolanaPaymentConfirmationPayload>(
    `/api/client/transfers/${transferId}/solana-payment`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        signature,
        submissionSource: submissionSource ?? 'manual_copy_address'
      })
    },
    'Could not verify Solana payment.',
    { token }
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
  return requestJson('/api/client/kyc/sender/status', {}, 'Unable to refresh KYC status.', { token });
}

export async function startSenderKycSession(token: string): Promise<{ token?: string }> {
  return requestJson(
    '/api/client/kyc/sender/sumsub-token',
    { method: 'POST' },
    'Could not start verification.',
    { token }
  );
}

export async function confirmBaseWalletPayment(
  token: string,
  transferId: string,
  txHash: string,
  submissionSource?: PaymentSubmissionSource
): Promise<BasePaymentConfirmationPayload> {
  return requestJson<BasePaymentConfirmationPayload>(
    `/api/client/transfers/${transferId}/base-payment`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        txHash,
        submissionSource: submissionSource ?? 'manual_copy_address'
      })
    },
    'Could not verify Base payment.',
    { token }
  );
}
