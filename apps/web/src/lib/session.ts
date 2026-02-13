import type { AuthSessionState } from '@/lib/contracts';

export const ACCESS_TOKEN_KEY = 'cryptopay:web:access-token';
export const AUTH_SESSION_KEY = 'cryptopay:web:auth-session';

function inBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readAccessToken(): string {
  if (!inBrowser()) return '';
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
}

export function writeAccessToken(token: string): void {
  if (!inBrowser()) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (!inBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function readAuthSession(): AuthSessionState | null {
  if (!inBrowser()) return null;
  const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSessionState;
    if (!parsed.token) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthSession(session: AuthSessionState): void {
  if (!inBrowser()) return;
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  writeAccessToken(session.token);
}

export function clearAuthSession(): void {
  if (!inBrowser()) return;
  window.localStorage.removeItem(AUTH_SESSION_KEY);
  clearAccessToken();
}
