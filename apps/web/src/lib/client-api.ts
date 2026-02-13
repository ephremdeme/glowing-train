export interface ApiErrorShape {
  error?: {
    code?: string;
    message?: string;
  };
}

export function readApiMessage(payload: unknown, fallback: string): string {
  const typed = payload as ApiErrorShape;
  return typed.error?.message ?? fallback;
}

export function authHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`
  };
}
