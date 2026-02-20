import type { AuthSessionState } from '@/lib/contracts';

export const ACCESS_TOKEN_KEY = 'cryptopay:web:access-token';
export const AUTH_SESSION_KEY = 'cryptopay:web:auth-session';

let accessTokenCache = '';

function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readAccessToken(): string {
  if (!inBrowser()) return accessTokenCache;
  if (accessTokenCache) return accessTokenCache;
  accessTokenCache = window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
  if (!accessTokenCache) {
    const rawSession = window.sessionStorage.getItem(AUTH_SESSION_KEY);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession) as AuthSessionState;
        if (parsed.token) {
          accessTokenCache = parsed.token;
        }
      } catch {
        // Ignore malformed legacy auth-session blobs.
      }
    }
  }
  if (accessTokenCache) {
    window.sessionStorage.setItem(ACCESS_TOKEN_KEY, accessTokenCache);
  }
  return accessTokenCache;
}

export function writeAccessToken(token: string): void {
  accessTokenCache = token;
  if (!inBrowser()) return;
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  accessTokenCache = '';
  if (!inBrowser()) return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function readAuthSession(): AuthSessionState | null {
  if (!inBrowser()) return null;
  const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSessionState;
    if (!parsed.token) {
      return null;
    }
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSessionState): void {
  if (inBrowser()) {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  }
  writeAccessToken(session.token);
}

export function clearAuthSession(): void {
  if (inBrowser()) {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  }
  clearAccessToken();
}

export async function exchangeAccessToken(): Promise<{ token: string; customerId: string; sessionId: string; expiresAt: string }> {
  const response = await fetch('/api/client/auth/session/exchange', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: '{}'
  });

  const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
    | { token: string; customerId: string; sessionId: string; expiresAt: string }
    | { error?: { message?: string } };

  if (!response.ok || !('token' in payload) || !payload.token) {
    throw new Error((payload as { error?: { message?: string } }).error?.message ?? 'Could not exchange auth session.');
  }

  writeAccessToken(payload.token);
  return payload;
}
