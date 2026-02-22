import type { GoogleOAuthStartPayload } from '@/lib/contracts';

export interface ApiErrorShape {
  error?: {
    code?: string;
    message?: string;
  };
}

export const GOOGLE_AUTH_NEXT_KEY = 'cryptopay:web:google-next';

export function readApiMessage(payload: unknown, fallback: string): string {
  const typed = payload as ApiErrorShape;
  return typed.error?.message ?? fallback;
}

function isSessionExpiryMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('token expired') ||
    normalized.includes('jwt expired') ||
    normalized.includes('session expired') ||
    normalized.includes('session is invalid') ||
    normalized.includes('expired')
  );
}

export function readAuthMessage(payload: unknown, fallback: string): string {
  const typed = payload as ApiErrorShape;
  const code = typed.error?.code;
  const message = typed.error?.message;

  if (message && isSessionExpiryMessage(message)) {
    return 'Your session expired. Sign in again.';
  }

  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Email or password is incorrect.';
    case 'INVALID_PAYLOAD':
      return 'Please check the highlighted fields and try again.';
    case 'SESSION_REQUIRED':
    case 'SESSION_INVALID':
    case 'UNAUTHORIZED':
      return 'Your session expired. Sign in again.';
    case 'GOOGLE_AUTH_START_FAILED':
      return 'Could not start Google sign-in. Please retry.';
    case 'INTERNAL_ERROR':
      return 'Temporary service issue. Please try again in a moment.';
    default:
      break;
  }

  return message ?? fallback;
}

export function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`
  };
}

export function normalizeNextPath(nextPath: string | null | undefined, fallback = '/quote'): string {
  if (!nextPath) return fallback;
  if (!nextPath.startsWith('/')) return fallback;
  if (nextPath.startsWith('//')) return fallback;
  return nextPath;
}

export function storeGoogleNextPath(nextPath: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeNextPath(nextPath, '/quote');
  window.sessionStorage.setItem(GOOGLE_AUTH_NEXT_KEY, normalized);
}

export function consumeGoogleNextPath(fallback = '/quote'): string {
  if (typeof window === 'undefined') return fallback;
  const raw = window.sessionStorage.getItem(GOOGLE_AUTH_NEXT_KEY);
  window.sessionStorage.removeItem(GOOGLE_AUTH_NEXT_KEY);
  return normalizeNextPath(raw, fallback);
}

export async function startGoogleOAuth(nextPath: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Google OAuth can only start in the browser.' };
  }

  const redirectUri = `${window.location.origin}/auth/google/callback`;
  const query = new URLSearchParams({ redirectUri });
  storeGoogleNextPath(nextPath);

  const response = await fetch(`/api/client/auth/sign-in/google?${query.toString()}`);
  const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
    | GoogleOAuthStartPayload
    | ApiErrorShape;

  if (!response.ok || !('authUrl' in payload) || !payload.authUrl) {
    return { ok: false, message: readAuthMessage(payload, 'Could not start Google sign-in.') };
  }

  window.location.assign(payload.authUrl);
  return { ok: true };
}
