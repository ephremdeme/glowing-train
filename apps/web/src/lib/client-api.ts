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

  const response = await fetch(`/api/client/auth/oauth/google/start?${query.toString()}`);
  const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
    | GoogleOAuthStartPayload
    | ApiErrorShape;

  if (!response.ok || !('authUrl' in payload) || !payload.authUrl) {
    return { ok: false, message: readApiMessage(payload, 'Could not start Google sign-in.') };
  }

  window.location.assign(payload.authUrl);
  return { ok: true };
}
