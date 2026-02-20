import { assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { query, withTransaction } from '@cryptopay/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { getBetterAuth } from './config.js';

export type CustomerRow = {
  customer_id: string;
  full_name: string;
  country_code: string;
  status: string;
  user_id: string;
};

type BetterAuthSessionPayload = {
  session?: {
    id: string;
    userId: string;
    expiresAt: string;
  };
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
};

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function authBaseUrl(): string {
  return (
    process.env.CUSTOMER_AUTH_PUBLIC_URL ??
    process.env.CUSTOMER_AUTH_BASE_URL ??
    `http://localhost:${process.env.CUSTOMER_AUTH_PORT ?? '3005'}`
  );
}

export function requestHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }
    headers.set(key, value);
  }
  return headers;
}

function buildHeaders(params?: { headers?: Headers; cookie?: string }): Headers {
  const headers = new Headers(params?.headers);
  if (params?.cookie) {
    headers.set('cookie', params.cookie);
  }
  return headers;
}

function betterAuthUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return new URL(`/auth${normalized}`, authBaseUrl()).toString();
}

export async function invokeBetterAuth(params: {
  path: string;
  method: 'GET' | 'POST';
  headers?: Headers;
  cookie?: string;
  body?: unknown;
}): Promise<Response> {
  const auth = getBetterAuth();
  const headerArgs: { headers?: Headers; cookie?: string } = {};
  if (params.headers) {
    headerArgs.headers = params.headers;
  }
  if (params.cookie) {
    headerArgs.cookie = params.cookie;
  }
  const headers = buildHeaders(headerArgs);

  let body: string | undefined;
  if (params.body !== undefined) {
    body = JSON.stringify(params.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }

  const init: RequestInit = {
    method: params.method,
    headers,
    redirect: 'manual'
  };

  if (body !== undefined) {
    init.body = body;
  }

  return auth.handler(new Request(betterAuthUrl(params.path), init));
}

export function getSetCookies(response: Response): string[] {
  const typedHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof typedHeaders.getSetCookie === 'function') {
    return typedHeaders.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

export function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies.map((value) => value.split(';')[0]).join('; ');
}

export function applySetCookies(reply: FastifyReply, setCookies: string[]): void {
  if (setCookies.length === 0) {
    return;
  }
  reply.header('set-cookie', setCookies.length === 1 ? setCookies[0] : setCookies);
}

export async function responsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return await response.text();
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function payloadMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const withMessage = payload as {
    message?: string;
    error?: {
      message?: string;
    };
  };

  return withMessage.error?.message ?? withMessage.message ?? fallback;
}

export function customerClaims(request: FastifyRequest): AuthClaims {
  const previousSecret = process.env.AUTH_JWT_PREVIOUS_SECRET;
  const claims = authenticateBearerToken({
    authorizationHeader: request.headers.authorization,
    secret: process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me',
    secrets: previousSecret ? [previousSecret] : [],
    issuer: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services'
  });
  assertTokenType(claims, ['customer']);
  return claims;
}

export async function customerByUserId(userId: string): Promise<CustomerRow | null> {
  const result = await query(
    `
    select c.customer_id, c.full_name, c.country_code, c.status, l.user_id
    from customer_auth_link l
    join customer_account c on c.customer_id = l.customer_id
    where l.user_id = $1
    limit 1
    `,
    [userId]
  );

  const row = result.rows[0] as CustomerRow | undefined;
  return row ?? null;
}

export async function customerByCustomerId(customerId: string): Promise<CustomerRow | null> {
  const result = await query(
    `
    select c.customer_id, c.full_name, c.country_code, c.status, l.user_id
    from customer_account c
    left join customer_auth_link l on l.customer_id = c.customer_id
    where c.customer_id = $1
    limit 1
    `,
    [customerId]
  );

  const row = result.rows[0] as CustomerRow | undefined;
  return row ?? null;
}

export async function ensureCustomerLink(params: {
  userId: string;
  email: string;
  fullName: string;
  countryCode: string;
}): Promise<CustomerRow> {
  const existing = await customerByUserId(params.userId);
  if (existing) {
    return existing;
  }

  const customerId = randomId('cust');
  const fullName = params.fullName.trim() || params.email;
  const countryCode = params.countryCode.trim().toUpperCase();

  try {
    await withTransaction(async (tx) => {
      await tx.query(
        `
        insert into customer_account (customer_id, full_name, country_code, status)
        values ($1, $2, $3, 'active')
        `,
        [customerId, fullName, countryCode]
      );

      await tx.query(
        `
        insert into sender_kyc_profile (customer_id, provider, kyc_status)
        values ($1, 'sumsub', 'pending')
        on conflict (customer_id) do nothing
        `,
        [customerId]
      );

      await tx.query(
        `
        insert into customer_auth_link (user_id, customer_id)
        values ($1, $2)
        `,
        [params.userId, customerId]
      );
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== '23505') {
      throw error;
    }
  }

  const resolved = await customerByUserId(params.userId);
  if (!resolved) {
    throw new Error(`Failed to resolve customer mapping for user ${params.userId}`);
  }
  return resolved;
}

export async function resolveAmr(userId: string): Promise<string[]> {
  const result = await query(
    `
    select provider_id
    from account
    where user_id = $1
    `,
    [userId]
  );

  const amr = new Set<string>();
  for (const row of result.rows as Array<{ provider_id?: string }>) {
    if (row.provider_id === 'credential') {
      amr.add('pwd');
      continue;
    }
    if (row.provider_id === 'google') {
      amr.add('oauth_google');
      continue;
    }
    if (row.provider_id) {
      amr.add(row.provider_id);
    }
  }

  if (amr.size === 0) {
    amr.add('pwd');
  }

  return [...amr];
}

export async function resolveSession(cookie?: string | null, headers?: Headers): Promise<{
  sessionId: string;
  userId: string;
  expiresAt: string;
  email: string;
  name: string;
} | null> {
  const sessionRequest: {
    path: string;
    method: 'GET';
    headers?: Headers;
    cookie?: string;
  } = {
    path: '/get-session',
    method: 'GET'
  };
  if (cookie) {
    sessionRequest.cookie = cookie;
  }
  if (headers) {
    sessionRequest.headers = headers;
  }

  const response = await invokeBetterAuth(sessionRequest);
  if (!response.ok) {
    return null;
  }

  const payload = (await responsePayload(response)) as BetterAuthSessionPayload | null;
  if (!payload?.session || !payload.user) {
    return null;
  }

  return {
    sessionId: payload.session.id,
    userId: payload.session.userId ?? payload.user.id,
    expiresAt: payload.session.expiresAt,
    email: payload.user.email ?? '',
    name: payload.user.name ?? ''
  };
}

export function withReplyFromResponse(reply: FastifyReply, response: Response, payload: unknown): FastifyReply {
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }
    reply.header(key, value);
  }
  applySetCookies(reply, getSetCookies(response));
  return reply.status(response.status).send(payload);
}
