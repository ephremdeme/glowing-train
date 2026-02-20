import { assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { getPool, withTransaction } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { appendCustomerAuthAudit } from '../audit/service.js';
import { issueCustomerExchangeToken } from '../token-exchange/service.js';
import {
  defaultGoogleRedirectUri,
  getBetterAuth,
  normalizeEmail,
  schemas
} from './config.js';

type CustomerRow = {
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

function authBaseUrl(): string {
  return (
    process.env.CUSTOMER_AUTH_PUBLIC_URL ??
    process.env.CUSTOMER_AUTH_BASE_URL ??
    `http://localhost:${process.env.CUSTOMER_AUTH_PORT ?? '3005'}`
  );
}

function requestHeaders(request: FastifyRequest): Headers {
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

async function invokeBetterAuth(params: {
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

function getSetCookies(response: Response): string[] {
  const typedHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof typedHeaders.getSetCookie === 'function') {
    return typedHeaders.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies.map((value) => value.split(';')[0]).join('; ');
}

function applySetCookies(reply: FastifyReply, setCookies: string[]): void {
  if (setCookies.length === 0) {
    return;
  }
  reply.header('set-cookie', setCookies.length === 1 ? setCookies[0] : setCookies);
}

async function responsePayload(response: Response): Promise<unknown> {
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

function payloadMessage(payload: unknown, fallback: string): string {
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

function customerClaims(request: FastifyRequest): AuthClaims {
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

async function customerByUserId(userId: string): Promise<CustomerRow | null> {
  const result = await getPool().query(
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

async function customerByCustomerId(customerId: string): Promise<CustomerRow | null> {
  const result = await getPool().query(
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

async function ensureCustomerLink(params: {
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

async function resolveAmr(userId: string): Promise<string[]> {
  const result = await getPool().query(
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

async function resolveSession(cookie?: string | null, headers?: Headers): Promise<{
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

function withReplyFromResponse(reply: FastifyReply, response: Response, payload: unknown): FastifyReply {
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }
    reply.header(key, value);
  }
  applySetCookies(reply, getSetCookies(response));
  return reply.status(response.status).send(payload);
}

export function registerBetterAuthRoutes(app: FastifyInstance): void {
  app.post('/auth/sign-up/email', async (request, reply) => {
    const parsed = schemas.signUpSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: getPool(),
      scope: 'customer-auth:signup:email',
      idempotencyKey,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const authResponse = await invokeBetterAuth({
          path: '/sign-up/email',
          method: 'POST',
          headers: requestHeaders(request),
          body: {
            name: parsed.data.fullName,
            email: normalizeEmail(parsed.data.email),
            password: parsed.data.password
          }
        });

        const authPayload = await responsePayload(authResponse);
        setCookies = getSetCookies(authResponse);
        if (!authResponse.ok) {
          return {
            status: authResponse.status,
            body: authPayload ?? {
              error: {
                code: 'SIGN_UP_FAILED',
                message: 'Could not create account.'
              }
            }
          };
        }

        const cookie = cookieHeaderFromSetCookies(setCookies);
        const session = await resolveSession(cookie.length > 0 ? cookie : null);
        if (!session) {
          return {
            status: 500,
            body: {
              error: {
                code: 'SESSION_CREATE_FAILED',
                message: 'Account created but session could not be resolved.'
              }
            }
          };
        }

        const customer = await ensureCustomerLink({
          userId: session.userId,
          email: parsed.data.email,
          fullName: parsed.data.fullName,
          countryCode: parsed.data.countryCode
        });

        await appendCustomerAuthAudit({
          actorType: 'customer',
          actorId: customer.customer_id,
          action: 'customer_registered',
          entityType: 'customer_account',
          entityId: customer.customer_id,
          metadata: { provider: 'credential' }
        });

        return {
          status: 201,
          body: {
            customer: {
              customerId: customer.customer_id,
              fullName: customer.full_name,
              countryCode: customer.country_code
            },
            session: {
              sessionId: session.sessionId,
              expiresAt: session.expiresAt
            }
          }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.post('/auth/sign-in/email', async (request, reply) => {
    const parsed = schemas.signInSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const authResponse = await invokeBetterAuth({
      path: '/sign-in/email',
      method: 'POST',
      headers: requestHeaders(request),
      body: {
        email: normalizeEmail(parsed.data.email),
        password: parsed.data.password
      }
    });

    const authPayload = await responsePayload(authResponse);
    if (!authResponse.ok) {
      return deny({
        request,
        reply,
        code: 'INVALID_CREDENTIALS',
        message: payloadMessage(authPayload, 'Invalid email or password.'),
        status: authResponse.status
      });
    }

    const setCookies = getSetCookies(authResponse);
    const cookie = cookieHeaderFromSetCookies(setCookies);
    const session = await resolveSession(cookie.length > 0 ? cookie : null);
    if (!session) {
      return deny({
        request,
        reply,
        code: 'SESSION_INVALID',
        message: 'Session was not created.',
        status: 500
      });
    }

    const customer = await ensureCustomerLink({
      userId: session.userId,
      email: session.email || parsed.data.email,
      fullName: session.name || session.email || parsed.data.email,
      countryCode: 'ET'
    });

    await appendCustomerAuthAudit({
      actorType: 'customer',
      actorId: customer.customer_id,
      action: 'customer_login_password',
      entityType: 'customer_account',
      entityId: customer.customer_id
    });

    applySetCookies(reply, setCookies);
    return reply.send({
      customer: {
        customerId: customer.customer_id,
        fullName: customer.full_name,
        countryCode: customer.country_code
      },
      session: {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
      }
    });
  });

  app.get('/auth/sign-in/google', async (request, reply) => {
    const parsed = schemas.googleStartSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: parsed.error.issues[0]?.message ?? 'Invalid query.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const authResponse = await invokeBetterAuth({
      path: '/sign-in/social',
      method: 'POST',
      headers: requestHeaders(request),
      body: {
        provider: 'google',
        callbackURL: parsed.data.redirectUri ?? defaultGoogleRedirectUri(),
        disableRedirect: true
      }
    });

    const authPayload = await responsePayload(authResponse);
    const authUrl =
      authPayload && typeof authPayload === 'object' && 'url' in authPayload
        ? String((authPayload as { url?: string }).url ?? '')
        : '';

    if (!authResponse.ok || authUrl.length === 0) {
      return deny({
        request,
        reply,
        code: 'GOOGLE_AUTH_START_FAILED',
        message: payloadMessage(authPayload, 'Could not start Google sign-in.'),
        status: authResponse.status
      });
    }

    return reply.send({ authUrl });
  });

  app.post('/auth/session/exchange', async (request, reply) => {
    const parsed = schemas.tokenExchangeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const session = await resolveSession(undefined, requestHeaders(request));
    if (!session) {
      return deny({
        request,
        reply,
        code: 'SESSION_REQUIRED',
        message: 'Active auth session is required.',
        status: 401
      });
    }

    if (parsed.data.sessionId && parsed.data.sessionId !== session.sessionId) {
      return deny({
        request,
        reply,
        code: 'SESSION_INVALID',
        message: 'Session is invalid or expired.',
        status: 401
      });
    }

    const customer = await ensureCustomerLink({
      userId: session.userId,
      email: session.email || `${session.userId}@unknown.local`,
      fullName: session.name || session.email || 'Customer',
      countryCode: 'ET'
    });

    const amr = await resolveAmr(session.userId);
    const issued = issueCustomerExchangeToken({
      customerId: customer.customer_id,
      sessionId: session.sessionId,
      amr
    });

    await appendCustomerAuthAudit({
      actorType: 'customer',
      actorId: customer.customer_id,
      action: 'customer_session_exchanged',
      entityType: 'session',
      entityId: session.sessionId
    });

    return reply.send({
      token: issued.token,
      expiresAt: issued.expiresAt,
      customerId: customer.customer_id,
      sessionId: session.sessionId
    });
  });

  app.post('/auth/sign-out', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const currentSession = await resolveSession(undefined, requestHeaders(request));
    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: getPool(),
      scope: 'customer-auth:signout',
      idempotencyKey,
      requestId: request.id,
      requestPayload: { sessionId: currentSession?.sessionId ?? null },
      execute: async () => {
        const authResponse = await invokeBetterAuth({
          path: '/sign-out',
          method: 'POST',
          headers: requestHeaders(request)
        });
        const authPayload = await responsePayload(authResponse);
        setCookies = getSetCookies(authResponse);

        if (!authResponse.ok) {
          return {
            status: authResponse.status,
            body: authPayload ?? { ok: false }
          };
        }

        if (currentSession) {
          const customer = await customerByUserId(currentSession.userId);
          if (customer) {
            await appendCustomerAuthAudit({
              actorType: 'customer',
              actorId: customer.customer_id,
              action: 'customer_logout',
              entityType: 'session',
              entityId: currentSession.sessionId
            });
          }
        }

        return {
          status: 200,
          body: { ok: true }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.post('/auth/sign-out/all', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const currentSession = await resolveSession(undefined, requestHeaders(request));
    if (!currentSession) {
      return deny({
        request,
        reply,
        code: 'SESSION_REQUIRED',
        message: 'Active auth session is required.',
        status: 401
      });
    }

    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: getPool(),
      scope: 'customer-auth:signout-all',
      idempotencyKey,
      requestId: request.id,
      requestPayload: { userId: currentSession.userId },
      execute: async () => {
        await getPool().query('delete from session where user_id = $1', [currentSession.userId]);
        const authResponse = await invokeBetterAuth({
          path: '/sign-out',
          method: 'POST',
          headers: requestHeaders(request)
        });
        setCookies = getSetCookies(authResponse);

        const customer = await customerByUserId(currentSession.userId);
        if (customer) {
          await appendCustomerAuthAudit({
            actorType: 'customer',
            actorId: customer.customer_id,
            action: 'customer_logout_all',
            entityType: 'customer_account',
            entityId: customer.customer_id
          });
        }

        return {
          status: 200,
          body: { ok: true }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.get('/auth/me', async (request, reply) => {
    let customer: CustomerRow | null = null;

    try {
      const claims = customerClaims(request);
      customer = await customerByCustomerId(claims.sub);
    } catch {
      const session = await resolveSession(undefined, requestHeaders(request));
      if (session) {
        customer = await customerByUserId(session.userId);
        if (!customer) {
          customer = await ensureCustomerLink({
            userId: session.userId,
            email: session.email || `${session.userId}@unknown.local`,
            fullName: session.name || session.email || 'Customer',
            countryCode: 'ET'
          });
        }
      }
    }

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
        status: 401
      });
    }

    const senderKyc = await getPool().query(
      `
      select kyc_status, applicant_id, reason_code, last_reviewed_at
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [customer.customer_id]
    );

    const kyc = senderKyc.rows[0] as
      | {
          kyc_status: string;
          applicant_id: string | null;
          reason_code: string | null;
          last_reviewed_at: Date | null;
        }
      | undefined;

    return reply.send({
      customerId: customer.customer_id,
      fullName: customer.full_name,
      countryCode: customer.country_code,
      status: customer.status,
      senderKyc: {
        kycStatus: kyc?.kyc_status ?? 'pending',
        applicantId: kyc?.applicant_id ?? null,
        reasonCode: kyc?.reason_code ?? null,
        lastReviewedAt: kyc?.last_reviewed_at?.toISOString() ?? null
      }
    });
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, authBaseUrl());
      const path = `${url.pathname.replace(/^\/auth/, '')}${url.search}`;
      const method = request.method === 'POST' ? 'POST' : 'GET';
      const response = await invokeBetterAuth({
        path,
        method,
        headers: requestHeaders(request),
        body: method === 'POST' ? request.body : undefined
      });

      const payload = await responsePayload(response);
      return withReplyFromResponse(reply, response, payload);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;
    log('error', 'customer-auth unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error.',
        requestId: request.id
      }
    });
  });
}
