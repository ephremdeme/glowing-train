import {
  assertHasRole,
  assertTokenType,
  authenticateBearerToken,
  createAuthRateLimiter,
  createHs256Jwt,
  createRateLimiter,
  registerCors,
  registerVersionHeaders,
  verifySignedPayloadSignature,
  type AuthClaims
} from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { createServiceMetrics, deepHealthCheck, log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from './modules/audit/index.js';
import { FundingConfirmationRepository, FundingConfirmationService } from './modules/funding-confirmations/index.js';
import { QuoteRepository, QuoteService } from './modules/quotes/index.js';
import { ReceiverKycRepository, ReceiverKycService } from './modules/receiver-kyc/index.js';
import { buildQuoteRoutes } from './routes/quotes.js';
import { ExchangeRateApiProvider } from '@cryptopay/adapters';

const createQuoteSchema = z.object({
  chain: z.enum(['base', 'solana']),
  token: z.enum(['USDC', 'USDT']),
  sendAmountUsd: z.number().positive(),
  fxRateUsdToEtb: z.number().positive(),
  feeUsd: z.number().min(0),
  expiresInSeconds: z.number().int().positive().max(1800).default(300)
});

const fundingCallbackSchema = z.object({
  eventId: z.string().min(1),
  chain: z.enum(['base', 'solana']),
  token: z.enum(['USDC', 'USDT']),
  txHash: z.string().min(1),
  logIndex: z.number().int().nonnegative(),
  depositAddress: z.string().min(1),
  amountUsd: z.number().positive(),
  confirmedAt: z.string().datetime()
});

const retryPayoutSchema = z.object({
  reason: z.string().min(3)
});

const markReviewedSchema = z.object({
  reason: z.string().min(3)
});

const reconciliationRunSchema = z.object({
  reason: z.string().min(3),
  outputPath: z.string().min(1).optional()
});

const receiverKycUpsertSchema = z.object({
  receiverId: z.string().min(1),
  kycStatus: z.enum(['approved', 'pending', 'rejected']),
  nationalIdVerified: z.boolean(),
  nationalId: z.string().min(4).optional(),
  reason: z.string().min(3)
});

const watcherCheckpointSchema = z.object({
  chain: z.enum(['base', 'solana']),
  cursor: z.string().min(1)
});

const watcherDedupeSchema = z.object({
  eventKey: z.string().min(1)
});

const watcherRouteResolveSchema = z.object({
  watcherName: z.string().min(1),
  chain: z.enum(['base', 'solana']),
  token: z.enum(['USDC', 'USDT']),
  depositAddress: z.string().min(1)
});

const authRegisterSchema = z.object({
  fullName: z.string().min(1),
  countryCode: z.string().min(2).max(3),
  email: z.string().email().optional(),
  phoneE164: z.string().min(8).max(20).optional(),
  password: z.string().min(8).max(200).optional()
});

const authPasswordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional()
});

const authEmailRequestSchema = z.object({
  email: z.string().email()
});

const authEmailVerifySchema = z.object({
  challengeId: z.string().min(1),
  token: z.string().min(6),
  totpCode: z.string().length(6).optional()
});

const authPhoneRequestSchema = z.object({
  phoneE164: z.string().min(8).max(20)
});

const authPhoneVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().length(6),
  totpCode: z.string().length(6).optional()
});

const authGoogleStartSchema = z.object({
  redirectUri: z.string().url().optional()
});

const authGoogleCallbackSchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1)
});

const authTotpCodeSchema = z.object({
  code: z.string().length(6)
});

const authRefreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
  csrfToken: z.string().min(8).optional()
});

const recipientCreateSchema = z.object({
  fullName: z.string().min(1),
  bankAccountName: z.string().min(1),
  bankAccountNumber: z.string().min(4),
  bankCode: z.string().min(1),
  phoneE164: z.string().min(8).max(20).optional(),
  countryCode: z.string().min(2).max(3),
  nationalId: z.string().min(4).optional(),
  nationalIdVerified: z.boolean().default(false),
  kycStatus: z.enum(['approved', 'pending', 'rejected']).default('pending')
});

const recipientUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  bankAccountName: z.string().min(1).optional(),
  bankAccountNumber: z.string().min(4).optional(),
  bankCode: z.string().min(1).optional(),
  phoneE164: z.string().min(8).max(20).optional(),
  countryCode: z.string().min(2).max(3).optional(),
  nationalId: z.string().min(4).optional(),
  nationalIdVerified: z.boolean().optional(),
  kycStatus: z.enum(['approved', 'pending', 'rejected']).optional()
});

const senderKycWebhookSchema = z.object({
  customerId: z.string().min(1),
  applicantId: z.string().min(1).optional(),
  reviewStatus: z.enum(['pending', 'approved', 'rejected']),
  reasonCode: z.string().min(1).optional()
});

const transferCreateSchema = z.object({
  quoteId: z.string().min(1),
  recipientId: z.string().min(1)
});

const transferListQuerySchema = z.object({
  status: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const meUpdateSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    countryCode: z.string().min(2).max(3).optional()
  })
  .refine((value) => value.fullName !== undefined || value.countryCode !== undefined, {
    message: 'At least one field is required.'
  });

function sha256(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

type IdempotentResponse = {
  status: number;
  body: unknown;
};

async function withIdempotency(params: {
  scope: string;
  idempotencyKey: string;
  requestId: string;
  requestPayload: unknown;
  execute: () => Promise<IdempotentResponse>;
}): Promise<IdempotentResponse> {
  const pool = getPool();
  const key = `${params.scope}:${params.idempotencyKey}`;
  const requestHash = sha256(params.requestPayload);

  const existing = await pool.query('select request_hash, response_status, response_body from idempotency_record where key = $1', [key]);
  const row = existing.rows[0] as
    | {
      request_hash: string;
      response_status: number;
      response_body: unknown;
    }
    | undefined;

  if (row) {
    if (row.request_hash !== requestHash) {
      return {
        status: 409,
        body: {
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key was reused with a different payload.',
            requestId: params.requestId
          }
        }
      };
    }

    return {
      status: row.response_status,
      body: row.response_body
    };
  }

  const response = await params.execute();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  await pool.query(
    `
    insert into idempotency_record (key, request_hash, response_status, response_body, expires_at)
    values ($1, $2, $3, $4, $5)
    on conflict (key) do nothing
    `,
    [key, requestHash, response.status, response.body, expiresAt]
  );

  return response;
}

function requiredIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (!value || typeof value !== 'string') {
    throw new Error('Missing idempotency-key header.');
  }

  return value;
}

function toAuthClaims(request: FastifyRequest): AuthClaims {
  const secret = process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me';
  const previousSecret = process.env.AUTH_JWT_PREVIOUS_SECRET;
  const issuer = process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal';
  const audience = process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services';

  return authenticateBearerToken({
    authorizationHeader: request.headers.authorization,
    secret,
    secrets: previousSecret ? [previousSecret] : [],
    issuer,
    audience
  });
}

function toCustomerClaims(request: FastifyRequest): AuthClaims {
  const claims = toAuthClaims(request);
  assertTokenType(claims, ['customer']);
  return claims;
}

function errorEnvelope(request: FastifyRequest, code: string, message: string, details?: unknown): { error: Record<string, unknown> } {
  const error: Record<string, unknown> = {
    code,
    message,
    requestId: request.id
  };

  if (details !== undefined) {
    error.details = details;
  }

  return { error };
}

function deny(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}): FastifyReply {
  return params.reply.status(params.status ?? 401).send(errorEnvelope(params.request, params.code, params.message, params.details));
}

function buildInternalServiceToken(scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const issuer = process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal';
  const audience = process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services';
  const secret = process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me';

  return createHs256Jwt(
    {
      sub: 'core-api-internal',
      iss: issuer,
      aud: audience,
      exp: now + 60,
      iat: now,
      tokenType: 'service',
      scope: [scope]
    },
    secret
  );
}

function assertScope(claims: AuthClaims, scope: string): void {
  if (claims.tokenType !== 'service') {
    throw new Error('Forbidden: service token required.');
  }

  const scopes = claims.scope ?? [];
  if (!scopes.includes(scope)) {
    throw new Error(`Forbidden: missing required scope ${scope}.`);
  }
}

async function forwardToReconciliationWorker(params: {
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  actor: string;
  command: string;
  idempotencyKey?: string;
}): Promise<Response> {
  const baseUrl = process.env.RECONCILIATION_WORKER_URL ?? 'http://localhost:3004';
  const token = buildInternalServiceToken('ops:reconciliation:proxy');

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'x-ops-actor': params.actor,
    'x-ops-command': params.command
  };

  if (params.idempotencyKey) {
    headers['idempotency-key'] = params.idempotencyKey;
  }

  let body: string | undefined;
  if (params.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(params.body);
  }

  const init: RequestInit = {
    method: params.method,
    headers
  };
  if (body !== undefined) {
    init.body = body;
  }

  return fetch(`${baseUrl}${params.path}`, init);
}

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const pairs = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

function refreshCookieConfig(): { secure: boolean; sameSite: 'Lax' | 'Strict'; path: string } {
  return {
    secure: (process.env.AUTH_COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
    sameSite: 'Lax',
    path: '/v1/auth/refresh'
  };
}

function buildRefreshSetCookie(name: string, value: string, maxAgeSeconds: number): string {
  const config = refreshCookieConfig();
  const attrs = [
    `${name}=${value}`,
    `Path=${config.path}`,
    'HttpOnly',
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${config.sameSite}`
  ];
  if (config.secure) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

function buildCsrfSetCookie(value: string, maxAgeSeconds: number): string {
  const config = refreshCookieConfig();
  const attrs = [`cp_csrf=${value}`, `Path=${config.path}`, `Max-Age=${maxAgeSeconds}`, `SameSite=${config.sameSite}`];
  if (config.secure) {
    attrs.push('Secure');
  }
  return attrs.join('; ');
}

function refreshCookieMaxAgeSeconds(): number {
  const value = Number(process.env.AUTH_CUSTOMER_REFRESH_TTL_SECONDS ?? String(30 * 24 * 3600));
  if (!Number.isFinite(value) || value <= 0) {
    return 30 * 24 * 3600;
  }
  return value;
}

function applySessionCookies(reply: FastifyReply, session: { refreshToken: string; csrfToken: string }): void {
  const maxAge = refreshCookieMaxAgeSeconds();
  reply.header('set-cookie', [
    buildRefreshSetCookie('cp_refresh_token', session.refreshToken, maxAge),
    buildCsrfSetCookie(session.csrfToken, maxAge)
  ]);
}

function clearSessionCookies(reply: FastifyReply): void {
  reply.header('set-cookie', [
    buildRefreshSetCookie('cp_refresh_token', '', 0),
    buildCsrfSetCookie('', 0)
  ]);
}

async function forwardToCustomerAuth(params: {
  path: string;
  method: 'GET' | 'POST';
  request: FastifyRequest;
  body?: unknown;
  query?: Record<string, string | undefined>;
}): Promise<Response> {
  const baseUrl = process.env.CUSTOMER_AUTH_URL ?? 'http://localhost:3005';
  const token = buildInternalServiceToken('customer-auth:proxy');

  const headers: Record<string, string> = {
    'x-service-authorization': `Bearer ${token}`
  };

  const idempotencyKey = params.request.headers['idempotency-key'];
  if (typeof idempotencyKey === 'string') {
    headers['idempotency-key'] = idempotencyKey;
  }

  if (params.request.headers.authorization) {
    headers.authorization = params.request.headers.authorization;
  }

  let body: string | undefined;
  if (params.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(params.body);
  }

  const init: RequestInit = {
    method: params.method,
    headers
  };
  if (body !== undefined) {
    init.body = body;
  }

  const url = new URL(`${baseUrl}${params.path}`);
  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  return fetch(url, init);
}

export async function buildCoreApiApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // -- Security middleware --
  registerCors(app);
  registerVersionHeaders(app);
  const generalLimiter = createRateLimiter({
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 200),
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000)
  });
  generalLimiter.register(app);

  const metrics = createServiceMetrics('core-api');
  const fxProvider = new ExchangeRateApiProvider({
    cacheTtlMs: Number(process.env['FX_RATE_CACHE_TTL_MS'] ?? 3_600_000)
  });
  const quoteRoutes = buildQuoteRoutes(new QuoteService(new QuoteRepository()), {
    fxProvider,
    fxRateTolerancePercent: Number(process.env['FX_RATE_TOLERANCE_PERCENT'] ?? 2)
  });
  const fundingService = new FundingConfirmationService(new FundingConfirmationRepository());
  const auditService = new AuditService();
  const receiverKycService = new ReceiverKycService(new ReceiverKycRepository());

  app.addHook('onRequest', async (request) => {
    request.headers['x-request-start'] = String(Date.now());
  });

  app.addHook('onResponse', async (request, reply) => {
    const start = Number(request.headers['x-request-start'] ?? Date.now());
    const duration = Math.max(Date.now() - start, 0);
    const route = request.routeOptions.url ?? request.url;
    const status = String(reply.statusCode);

    metrics.requestDurationMs.labels(request.method, route, status).observe(duration);
    metrics.requestCount.labels(request.method, route, status).inc();

    if (reply.statusCode >= 400) {
      metrics.errorCount.labels(status).inc();
    }
  });

  app.get('/healthz', async () => ({ ok: true, service: 'core-api' }));
  app.get('/readyz', async (_request, reply) => {
    const health = await deepHealthCheck('core-api');
    const status = health.status === 'unhealthy' ? 503 : 200;
    return reply.status(status).send(health);
  });
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.post('/v1/auth/register', async (request, reply) => {
    const parsed = authRegisterSchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/register',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/login/password', async (request, reply) => {
    const parsed = authPasswordLoginSchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/login/password',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/login/magic-link/request', async (request, reply) => {
    const parsed = authEmailRequestSchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/login/magic-link/request',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/login/magic-link/verify', async (request, reply) => {
    const parsed = authEmailVerifySchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/login/magic-link/verify',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/login/phone/request-otp', async (request, reply) => {
    const parsed = authPhoneRequestSchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/login/phone/request-otp',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/login/phone/verify-otp', async (request, reply) => {
    const parsed = authPhoneVerifySchema.safeParse(request.body);
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/login/phone/verify-otp',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.get('/v1/auth/oauth/google/start', async (request, reply) => {
    const parsed = authGoogleStartSchema.safeParse(request.query ?? {});
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/oauth/google/start',
      method: 'GET',
      request,
      query: {
        redirectUri: parsed.data.redirectUri
      }
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.get('/v1/auth/oauth/google/callback', async (request, reply) => {
    const parsed = authGoogleCallbackSchema.safeParse(request.query ?? {});
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

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/oauth/google/callback',
      method: 'GET',
      request,
      query: parsed.data
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/mfa/totp/setup', async (request, reply) => {
    try {
      toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/mfa/totp/setup',
      method: 'POST',
      request,
      body: {}
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/mfa/totp/enable', async (request, reply) => {
    const parsed = authTotpCodeSchema.safeParse(request.body);
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

    try {
      toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/mfa/totp/enable',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/mfa/totp/disable', async (request, reply) => {
    const parsed = authTotpCodeSchema.safeParse(request.body);
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

    try {
      toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/mfa/totp/disable',
      method: 'POST',
      request,
      body: parsed.data
    });
    const payload = await response.json().catch(() => ({}));
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/refresh', async (request, reply) => {
    const parsed = authRefreshSchema.safeParse(request.body ?? {});
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

    const cookies = parseCookieHeader(request.headers.cookie);
    const refreshToken = parsed.data.refreshToken ?? cookies.cp_refresh_token;
    const csrfToken = parsed.data.csrfToken ?? request.headers['x-csrf-token']?.toString() ?? cookies.cp_csrf;

    if (!refreshToken || !csrfToken) {
      return deny({
        request,
        reply,
        code: 'MISSING_REFRESH_CONTEXT',
        message: 'refreshToken and csrfToken are required.',
        status: 400
      });
    }

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/refresh',
      method: 'POST',
      request,
      body: {
        refreshToken,
        csrfToken
      }
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const session = payload.session as { refreshToken?: string; csrfToken?: string } | undefined;
    if (session?.refreshToken && session.csrfToken) {
      applySessionCookies(reply, {
        refreshToken: session.refreshToken,
        csrfToken: session.csrfToken
      });
    }
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    try {
      toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const cookies = parseCookieHeader(request.headers.cookie);
    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/logout',
      method: 'POST',
      request,
      body: {
        refreshToken: cookies.cp_refresh_token
      }
    });
    const payload = await response.json().catch(() => ({}));
    clearSessionCookies(reply);
    return reply.status(response.status).send(payload);
  });

  app.post('/v1/auth/logout-all', async (request, reply) => {
    try {
      toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const response = await forwardToCustomerAuth({
      path: '/internal/v1/auth/logout-all',
      method: 'POST',
      request,
      body: {}
    });
    const payload = await response.json().catch(() => ({}));
    clearSessionCookies(reply);
    return reply.status(response.status).send(payload);
  });

  app.get('/v1/me', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const customerResult = await getPool().query(
      `
      select customer_id, full_name, country_code, status
      from customer_account
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const customer = customerResult.rows[0] as
      | {
        customer_id: string;
        full_name: string;
        country_code: string;
        status: string;
      }
      | undefined;

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer profile not found.',
        status: 404
      });
    }

    const senderKyc = await getPool().query(
      `
      select kyc_status, applicant_id, reason_code, last_reviewed_at
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const kycRow = senderKyc.rows[0] as
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
        kycStatus: kycRow?.kyc_status ?? 'pending',
        applicantId: kycRow?.applicant_id ?? null,
        reasonCode: kycRow?.reason_code ?? null,
        lastReviewedAt: kycRow?.last_reviewed_at?.toISOString() ?? null
      }
    });
  });

  app.patch('/v1/me', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = meUpdateSchema.safeParse(request.body);
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

    const updated = await getPool().query(
      `
      update customer_account
      set
        full_name = coalesce($2, full_name),
        country_code = coalesce($3, country_code),
        updated_at = now()
      where customer_id = $1
      returning customer_id, full_name, country_code, status, updated_at
      `,
      [claims.sub, parsed.data.fullName ?? null, parsed.data.countryCode?.toUpperCase() ?? null]
    );
    const row = updated.rows[0] as
      | {
        customer_id: string;
        full_name: string;
        country_code: string;
        status: string;
        updated_at: Date;
      }
      | undefined;

    if (!row) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer profile not found.',
        status: 404
      });
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'customer_profile_updated',
      entityType: 'customer_account',
      entityId: claims.sub
    });

    return reply.send({
      customerId: row.customer_id,
      fullName: row.full_name,
      countryCode: row.country_code,
      status: row.status,
      updatedAt: row.updated_at.toISOString()
    });
  });

  app.post('/v1/recipients', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = recipientCreateSchema.safeParse(request.body);
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

    const recipientId = `rcp_${randomBytes(10).toString('hex')}`;
    const inserted = await getPool().query(
      `
      insert into recipient (
        recipient_id,
        customer_id,
        full_name,
        bank_account_name,
        bank_account_number,
        bank_code,
        phone_e164,
        country_code,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      returning recipient_id, customer_id, full_name, bank_account_name, bank_account_number, bank_code, phone_e164, country_code, status, created_at, updated_at
      `,
      [
        recipientId,
        claims.sub,
        parsed.data.fullName,
        parsed.data.bankAccountName,
        parsed.data.bankAccountNumber,
        parsed.data.bankCode,
        parsed.data.phoneE164 ?? null,
        parsed.data.countryCode.toUpperCase()
      ]
    );
    const recipient = inserted.rows[0] as
      | {
        recipient_id: string;
        customer_id: string;
        full_name: string;
        bank_account_name: string;
        bank_account_number: string;
        bank_code: string;
        phone_e164: string | null;
        country_code: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }
      | undefined;

    if (!recipient) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_CREATE_FAILED',
        message: 'Recipient could not be created.',
        status: 500
      });
    }

    const kycProfile = await receiverKycService.upsert({
      receiverId: recipient.recipient_id,
      kycStatus: parsed.data.kycStatus,
      nationalIdVerified: parsed.data.nationalIdVerified,
      ...(parsed.data.nationalId ? { nationalIdPlaintext: parsed.data.nationalId } : {})
    });
    await getPool().query('update receiver_kyc_profile set recipient_id = $2, updated_at = now() where receiver_id = $1', [
      recipient.recipient_id,
      recipient.recipient_id
    ]);

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_created',
      entityType: 'recipient',
      entityId: recipient.recipient_id
    });

    return reply.status(201).send({
      recipientId: recipient.recipient_id,
      fullName: recipient.full_name,
      bankAccountName: recipient.bank_account_name,
      bankAccountNumber: recipient.bank_account_number,
      bankCode: recipient.bank_code,
      phoneE164: recipient.phone_e164,
      countryCode: recipient.country_code,
      status: recipient.status,
      receiverKyc: {
        kycStatus: kycProfile.kycStatus,
        nationalIdVerified: kycProfile.nationalIdVerified
      },
      createdAt: recipient.created_at.toISOString(),
      updatedAt: recipient.updated_at.toISOString()
    });
  });

  app.get('/v1/recipients', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const result = await getPool().query(
      `
      select recipient_id, full_name, bank_account_name, bank_account_number, bank_code, phone_e164, country_code, status, created_at, updated_at
      from recipient
      where customer_id = $1 and status != 'deleted'
      order by created_at desc
      `,
      [claims.sub]
    );

    return reply.send({
      recipients: result.rows.map((row) => ({
        recipientId: row.recipient_id as string,
        fullName: row.full_name as string,
        bankAccountName: row.bank_account_name as string,
        bankAccountNumber: row.bank_account_number as string,
        bankCode: row.bank_code as string,
        phoneE164: (row.phone_e164 as string | null) ?? null,
        countryCode: row.country_code as string,
        status: row.status as string,
        createdAt: (row.created_at as Date).toISOString(),
        updatedAt: (row.updated_at as Date).toISOString()
      }))
    });
  });

  app.get('/v1/recipients/:recipientId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const result = await getPool().query(
      `
      select recipient_id, full_name, bank_account_name, bank_account_number, bank_code, phone_e164, country_code, status, created_at, updated_at
      from recipient
      where recipient_id = $1 and customer_id = $2 and status != 'deleted'
      limit 1
      `,
      [recipientId, claims.sub]
    );
    const row = result.rows[0] as
      | {
        recipient_id: string;
        full_name: string;
        bank_account_name: string;
        bank_account_number: string;
        bank_code: string;
        phone_e164: string | null;
        country_code: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }
      | undefined;
    if (!row) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    const kycResult = await getPool().query(
      `
      select kyc_status, national_id_verified
      from receiver_kyc_profile
      where recipient_id = $1 or receiver_id = $1
      limit 1
      `,
      [recipientId]
    );
    const kyc = kycResult.rows[0] as
      | {
        kyc_status: string;
        national_id_verified: boolean;
      }
      | undefined;

    return reply.send({
      recipientId: row.recipient_id,
      fullName: row.full_name,
      bankAccountName: row.bank_account_name,
      bankAccountNumber: row.bank_account_number,
      bankCode: row.bank_code,
      phoneE164: row.phone_e164,
      countryCode: row.country_code,
      status: row.status,
      receiverKyc: {
        kycStatus: kyc?.kyc_status ?? 'pending',
        nationalIdVerified: kyc?.national_id_verified ?? false
      },
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    });
  });

  app.patch('/v1/recipients/:recipientId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = recipientUpdateSchema.safeParse(request.body);
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

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const updated = await getPool().query(
      `
      update recipient
      set
        full_name = coalesce($3, full_name),
        bank_account_name = coalesce($4, bank_account_name),
        bank_account_number = coalesce($5, bank_account_number),
        bank_code = coalesce($6, bank_code),
        phone_e164 = coalesce($7, phone_e164),
        country_code = coalesce($8, country_code),
        updated_at = now()
      where recipient_id = $1 and customer_id = $2 and status != 'deleted'
      returning recipient_id, full_name, bank_account_name, bank_account_number, bank_code, phone_e164, country_code, status, created_at, updated_at
      `,
      [
        recipientId,
        claims.sub,
        parsed.data.fullName ?? null,
        parsed.data.bankAccountName ?? null,
        parsed.data.bankAccountNumber ?? null,
        parsed.data.bankCode ?? null,
        parsed.data.phoneE164 ?? null,
        parsed.data.countryCode?.toUpperCase() ?? null
      ]
    );
    const row = updated.rows[0] as
      | {
        recipient_id: string;
        full_name: string;
        bank_account_name: string;
        bank_account_number: string;
        bank_code: string;
        phone_e164: string | null;
        country_code: string;
        status: string;
        created_at: Date;
        updated_at: Date;
      }
      | undefined;

    if (!row) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    let receiverKyc:
      | {
        kycStatus: 'approved' | 'pending' | 'rejected';
        nationalIdVerified: boolean;
      }
      | null = null;

    const hasReceiverKycUpdate =
      parsed.data.kycStatus !== undefined || parsed.data.nationalIdVerified !== undefined || parsed.data.nationalId !== undefined;

    if (hasReceiverKycUpdate) {
      const existingKyc = await getPool().query(
        `
        select kyc_status, national_id_verified
        from receiver_kyc_profile
        where recipient_id = $1 or receiver_id = $1
        limit 1
        `,
        [recipientId]
      );
      const existingKycRow = existingKyc.rows[0] as
        | {
          kyc_status: 'approved' | 'pending' | 'rejected';
          national_id_verified: boolean;
        }
        | undefined;

      const profile = await receiverKycService.upsert({
        receiverId: recipientId,
        kycStatus: parsed.data.kycStatus ?? existingKycRow?.kyc_status ?? 'pending',
        nationalIdVerified: parsed.data.nationalIdVerified ?? existingKycRow?.national_id_verified ?? false,
        ...(parsed.data.nationalId ? { nationalIdPlaintext: parsed.data.nationalId } : {})
      });

      await getPool().query('update receiver_kyc_profile set recipient_id = $2, updated_at = now() where receiver_id = $1', [
        recipientId,
        recipientId
      ]);

      receiverKyc = {
        kycStatus: profile.kycStatus,
        nationalIdVerified: profile.nationalIdVerified
      };
    } else {
      const existingKyc = await getPool().query(
        `
        select kyc_status, national_id_verified
        from receiver_kyc_profile
        where recipient_id = $1 or receiver_id = $1
        limit 1
        `,
        [recipientId]
      );
      const existingKycRow = existingKyc.rows[0] as
        | {
          kyc_status: 'approved' | 'pending' | 'rejected';
          national_id_verified: boolean;
        }
        | undefined;
      if (existingKycRow) {
        receiverKyc = {
          kycStatus: existingKycRow.kyc_status,
          nationalIdVerified: existingKycRow.national_id_verified
        };
      }
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_updated',
      entityType: 'recipient',
      entityId: recipientId
    });

    if (hasReceiverKycUpdate) {
      await auditService.append({
        actorType: 'customer',
        actorId: claims.sub,
        action: 'recipient_kyc_updated',
        entityType: 'receiver_kyc_profile',
        entityId: recipientId,
        metadata: {
          kycStatus: receiverKyc?.kycStatus ?? null,
          nationalIdVerified: receiverKyc?.nationalIdVerified ?? null
        }
      });
    }

    return reply.send({
      recipientId: row.recipient_id,
      fullName: row.full_name,
      bankAccountName: row.bank_account_name,
      bankAccountNumber: row.bank_account_number,
      bankCode: row.bank_code,
      phoneE164: row.phone_e164,
      countryCode: row.country_code,
      status: row.status,
      receiverKyc,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    });
  });

  app.delete('/v1/recipients/:recipientId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const deleted = await getPool().query(
      `
      update recipient
      set status = 'deleted', updated_at = now()
      where recipient_id = $1 and customer_id = $2 and status != 'deleted'
      returning recipient_id
      `,
      [recipientId, claims.sub]
    );
    if (!deleted.rows[0]) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_deleted',
      entityType: 'recipient',
      entityId: recipientId
    });

    return reply.status(204).send();
  });

  app.get('/v1/kyc/sender/status', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const result = await getPool().query(
      `
      select provider, applicant_id, kyc_status, reason_code, last_reviewed_at
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const row = result.rows[0] as
      | {
        provider: string;
        applicant_id: string | null;
        kyc_status: string;
        reason_code: string | null;
        last_reviewed_at: Date | null;
      }
      | undefined;

    return reply.send({
      customerId: claims.sub,
      provider: row?.provider ?? 'sumsub',
      applicantId: row?.applicant_id ?? null,
      kycStatus: row?.kyc_status ?? 'pending',
      reasonCode: row?.reason_code ?? null,
      lastReviewedAt: row?.last_reviewed_at?.toISOString() ?? null
    });
  });

  app.post('/v1/kyc/sender/sumsub-token', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const applicantId = `sumsub_applicant_${claims.sub}`;
    await getPool().query(
      `
      insert into sender_kyc_profile (customer_id, provider, applicant_id, kyc_status, updated_at)
      values ($1, 'sumsub', $2, 'pending', now())
      on conflict (customer_id)
      do update set applicant_id = excluded.applicant_id, provider = excluded.provider, updated_at = now()
      `,
      [claims.sub, applicantId]
    );

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'sender_kyc_session_requested',
      entityType: 'sender_kyc_profile',
      entityId: claims.sub
    });

    return reply.send({
      provider: 'sumsub',
      applicantId,
      token: `sumsub_mock_token_${claims.sub}_${Date.now()}`
    });
  });

  app.post('/internal/v1/kyc/sender/sumsub/webhook', async (request, reply) => {
    const payloadText = JSON.stringify(request.body ?? {});
    const timestampHeader = request.headers['x-callback-timestamp'];
    const signatureHeader = request.headers['x-callback-signature'];
    if (typeof timestampHeader !== 'string' || typeof signatureHeader !== 'string') {
      return deny({
        request,
        reply,
        code: 'INVALID_SIGNATURE_HEADERS',
        message: 'Missing signature headers.',
        status: 401
      });
    }

    const signatureOk = verifySignedPayloadSignature({
      payload: payloadText,
      timestampMs: timestampHeader,
      signatureHex: signatureHeader,
      secret: process.env.SUMSUB_WEBHOOK_SECRET ?? process.env.WATCHER_CALLBACK_SECRET ?? 'dev-callback-secret-change-me',
      maxAgeMs: Number(process.env.SUMSUB_WEBHOOK_MAX_AGE_MS ?? '300000')
    });
    if (!signatureOk) {
      return deny({
        request,
        reply,
        code: 'INVALID_SIGNATURE',
        message: 'Invalid webhook signature.',
        status: 401
      });
    }

    const parsed = senderKycWebhookSchema.safeParse(request.body);
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

    let idemKey: string;
    try {
      idemKey = requiredIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }
    const response = await withIdempotency({
      scope: 'core-api:sender-kyc:sumsub-webhook',
      idempotencyKey: idemKey,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        await getPool().query(
          `
          insert into sender_kyc_profile (
            customer_id,
            provider,
            applicant_id,
            kyc_status,
            reason_code,
            last_reviewed_at,
            updated_at
          )
          values ($1, 'sumsub', $2, $3, $4, now(), now())
          on conflict (customer_id)
          do update set
            provider = excluded.provider,
            applicant_id = excluded.applicant_id,
            kyc_status = excluded.kyc_status,
            reason_code = excluded.reason_code,
            last_reviewed_at = now(),
            updated_at = now()
          `,
          [
            parsed.data.customerId,
            parsed.data.applicantId ?? null,
            parsed.data.reviewStatus,
            parsed.data.reasonCode ?? null
          ]
        );

        await auditService.append({
          actorType: 'system',
          actorId: 'sumsub-webhook',
          action: 'sender_kyc_status_updated',
          entityType: 'sender_kyc_profile',
          entityId: parsed.data.customerId,
          metadata: {
            kycStatus: parsed.data.reviewStatus,
            reasonCode: parsed.data.reasonCode ?? null
          }
        });

        return {
          status: 202,
          body: { ok: true }
        };
      }
    });

    return reply.status(response.status).send(response.body);
  });

  app.get('/v1/transfers', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = transferListQuerySchema.safeParse(request.query ?? {});
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

    const limit = parsed.data.limit ?? 20;
    const status = parsed.data.status ?? null;

    const rows = await getPool().query(
      `
      select
        t.transfer_id,
        t.quote_id,
        t.receiver_id as recipient_id,
        r.full_name as recipient_name,
        t.chain,
        t.token,
        t.send_amount_usd,
        t.status,
        dr.deposit_address,
        t.created_at
      from transfers t
      left join recipient r on r.recipient_id = t.receiver_id
      left join deposit_routes dr on dr.transfer_id = t.transfer_id and dr.status = 'active'
      where t.sender_id = $1
        and ($2::text is null or t.status = $2)
      order by t.created_at desc
      limit $3
      `,
      [claims.sub, status, limit]
    );

    return reply.send({
      items: rows.rows.map((row) => ({
        transferId: row.transfer_id as string,
        quoteId: row.quote_id as string,
        recipientId: row.recipient_id as string,
        recipientName: (row.recipient_name as string | null) ?? null,
        chain: row.chain as string,
        token: row.token as string,
        sendAmountUsd: Number(row.send_amount_usd),
        status: row.status as string,
        depositAddress: (row.deposit_address as string | null) ?? null,
        createdAt: (row.created_at as Date).toISOString()
      })),
      count: rows.rowCount ?? 0
    });
  });

  app.get('/v1/transfers/:transferId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const transferId = (request.params as { transferId: string }).transferId;
    const transferResult = await getPool().query(
      `
      select
        t.transfer_id,
        t.quote_id,
        t.sender_id,
        t.receiver_id as recipient_id,
        t.chain,
        t.token,
        t.send_amount_usd,
        t.status,
        t.created_at,
        q.fx_rate_usd_to_etb,
        q.fee_usd,
        q.recipient_amount_etb,
        q.expires_at,
        r.full_name as recipient_name,
        r.bank_account_name,
        r.bank_account_number,
        r.bank_code,
        r.phone_e164,
        dr.deposit_address,
        dr.deposit_memo
      from transfers t
      join quotes q on q.quote_id = t.quote_id
      left join recipient r on r.recipient_id = t.receiver_id
      left join deposit_routes dr on dr.transfer_id = t.transfer_id and dr.status = 'active'
      where t.transfer_id = $1
        and t.sender_id = $2
      limit 1
      `,
      [transferId, claims.sub]
    );

    const transfer = transferResult.rows[0] as
      | {
        transfer_id: string;
        quote_id: string;
        sender_id: string;
        recipient_id: string;
        chain: string;
        token: string;
        send_amount_usd: string;
        status: string;
        created_at: Date;
        fx_rate_usd_to_etb: string;
        fee_usd: string;
        recipient_amount_etb: string;
        expires_at: Date;
        recipient_name: string | null;
        bank_account_name: string | null;
        bank_account_number: string | null;
        bank_code: string | null;
        phone_e164: string | null;
        deposit_address: string | null;
        deposit_memo: string | null;
      }
      | undefined;

    if (!transfer) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found.',
        status: 404
      });
    }

    const transitionsResult = await getPool().query(
      `
      select from_state, to_state, occurred_at
      from transfer_transition
      where transfer_id = $1
      order by id asc
      `,
      [transferId]
    );

    const fundingResult = await getPool().query(
      `
      select event_id, tx_hash, amount_usd, confirmed_at
      from onchain_funding_event
      where transfer_id = $1
      limit 1
      `,
      [transferId]
    );

    const payoutResult = await getPool().query(
      `
      select payout_id, method, amount_etb, status, provider_reference, updated_at
      from payout_instruction
      where transfer_id = $1
      limit 1
      `,
      [transferId]
    );

    const funding = fundingResult.rows[0] as
      | {
        event_id: string;
        tx_hash: string;
        amount_usd: string;
        confirmed_at: Date;
      }
      | undefined;

    const payout = payoutResult.rows[0] as
      | {
        payout_id: string;
        method: string;
        amount_etb: string;
        status: string;
        provider_reference: string | null;
        updated_at: Date;
      }
      | undefined;

    return reply.send({
      transfer: {
        transferId: transfer.transfer_id,
        quoteId: transfer.quote_id,
        senderId: transfer.sender_id,
        recipientId: transfer.recipient_id,
        chain: transfer.chain,
        token: transfer.token,
        sendAmountUsd: Number(transfer.send_amount_usd),
        status: transfer.status,
        createdAt: transfer.created_at.toISOString(),
        depositAddress: transfer.deposit_address,
        depositMemo: transfer.deposit_memo
      },
      quote: {
        quoteId: transfer.quote_id,
        fxRateUsdToEtb: Number(transfer.fx_rate_usd_to_etb),
        feeUsd: Number(transfer.fee_usd),
        recipientAmountEtb: Number(transfer.recipient_amount_etb),
        expiresAt: transfer.expires_at.toISOString()
      },
      recipient: {
        recipientId: transfer.recipient_id,
        fullName: transfer.recipient_name,
        bankAccountName: transfer.bank_account_name,
        bankAccountNumber: transfer.bank_account_number,
        bankCode: transfer.bank_code,
        phoneE164: transfer.phone_e164
      },
      funding: funding
        ? {
          eventId: funding.event_id,
          txHash: funding.tx_hash,
          amountUsd: Number(funding.amount_usd),
          confirmedAt: funding.confirmed_at.toISOString()
        }
        : null,
      payout: payout
        ? {
          payoutId: payout.payout_id,
          method: payout.method,
          amountEtb: Number(payout.amount_etb),
          status: payout.status,
          providerReference: payout.provider_reference,
          updatedAt: payout.updated_at.toISOString()
        }
        : null,
      transitions: transitionsResult.rows.map((row) => ({
        fromState: (row.from_state as string | null) ?? null,
        toState: row.to_state as string,
        occurredAt: (row.occurred_at as Date).toISOString()
      }))
    });
  });

  app.post('/v1/transfers', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = transferCreateSchema.safeParse(request.body);
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

    let key: string;
    try {
      key = requiredIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }

    const senderKycResult = await getPool().query(
      `
      select kyc_status
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const senderKyc = senderKycResult.rows[0] as { kyc_status: 'approved' | 'pending' | 'rejected' } | undefined;
    if (!senderKyc || senderKyc.kyc_status !== 'approved') {
      return deny({
        request,
        reply,
        code: 'SENDER_KYC_REQUIRED',
        message: 'Sender KYC must be approved before first transfer.',
        status: 403
      });
    }

    const recipientResult = await getPool().query(
      `
      select recipient_id
      from recipient
      where recipient_id = $1 and customer_id = $2 and status = 'active'
      limit 1
      `,
      [parsed.data.recipientId, claims.sub]
    );
    if (!recipientResult.rows[0]) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    const receiverKycResult = await getPool().query(
      `
      select kyc_status, national_id_verified
      from receiver_kyc_profile
      where recipient_id = $1 or receiver_id = $1
      limit 1
      `,
      [parsed.data.recipientId]
    );
    const receiverKyc = receiverKycResult.rows[0] as { kyc_status: 'approved' | 'pending' | 'rejected'; national_id_verified: boolean } | undefined;

    const collectorToken = buildInternalServiceToken('collector:transfers:create');
    const collectorPayload = {
      quoteId: parsed.data.quoteId,
      senderId: claims.sub,
      receiverId: parsed.data.recipientId,
      senderKycStatus: senderKyc.kyc_status,
      receiverKycStatus: receiverKyc?.kyc_status ?? 'pending',
      receiverNationalIdVerified: receiverKyc?.national_id_verified ?? false,
      idempotencyKey: key
    };

    const collectorResponse = await fetch(`${process.env.OFFSHORE_COLLECTOR_URL ?? 'http://localhost:3002'}/internal/v1/transfers/create`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${collectorToken}`,
        'content-type': 'application/json',
        'idempotency-key': key
      },
      body: JSON.stringify(collectorPayload)
    });
    const payload = await collectorResponse.json().catch(() => ({}));
    return reply.status(collectorResponse.status).send(payload);
  });

  app.get('/internal/v1/watchers/routes', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const query = request.query as { chain?: string };
    const chain = query.chain;
    if (chain !== 'base' && chain !== 'solana') {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: 'chain must be one of base or solana.',
        status: 400
      });
    }

    const rows = await getPool().query(
      `
      select token, deposit_address as "depositAddress"
      from deposit_routes
      where chain = $1
        and status = 'active'
      `,
      [chain]
    );

    return reply.send({
      items: rows.rows
    });
  });

  app.get('/internal/v1/watchers/checkpoint/:watcherName', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const watcherName = (request.params as { watcherName: string }).watcherName;
    const row = await getPool().query('select cursor from watcher_checkpoint where watcher_name = $1 limit 1', [watcherName]);
    return reply.send({
      cursor: (row.rows[0] as { cursor?: string } | undefined)?.cursor ?? '0'
    });
  });

  app.post('/internal/v1/watchers/checkpoint/:watcherName', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const watcherName = (request.params as { watcherName: string }).watcherName;
    const parsed = watcherCheckpointSchema.safeParse(request.body);
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

    await getPool().query(
      `
      insert into watcher_checkpoint (watcher_name, chain, cursor)
      values ($1, $2, $3)
      on conflict (watcher_name)
      do update set
        chain = excluded.chain,
        cursor = excluded.cursor,
        updated_at = now()
      `,
      [watcherName, parsed.data.chain, parsed.data.cursor]
    );

    return reply.status(204).send();
  });

  app.post('/internal/v1/watchers/dedupe/check/:watcherName', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = watcherDedupeSchema.safeParse(request.body);
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

    const row = await getPool().query('select 1 from watcher_event_dedupe where event_key = $1 limit 1', [parsed.data.eventKey]);
    return reply.send({
      seen: !!row.rows[0]
    });
  });

  app.post('/internal/v1/watchers/dedupe/mark/:watcherName', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const watcherName = (request.params as { watcherName: string }).watcherName;
    const parsed = watcherDedupeSchema.safeParse(request.body);
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

    await getPool().query(
      `
      insert into watcher_event_dedupe (event_key, watcher_name)
      values ($1, $2)
      on conflict (event_key) do nothing
      `,
      [parsed.data.eventKey, watcherName]
    );

    return reply.status(204).send();
  });

  app.post('/internal/v1/watchers/resolve-route', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'watchers:internal');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = watcherRouteResolveSchema.safeParse(request.body);
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

    const row = await getPool().query(
      `
      select t.transfer_id
      from deposit_routes dr
      join transfers t on t.transfer_id = dr.transfer_id
      where dr.chain = $1
        and dr.token = $2
        and dr.deposit_address = $3
        and dr.status = 'active'
      limit 1
      `,
      [parsed.data.chain, parsed.data.token, parsed.data.depositAddress]
    );

    if (!row.rows[0]) {
      return reply.send({
        found: false
      });
    }

    const transferId = (row.rows[0] as { transfer_id: string }).transfer_id;
    return reply.send({
      found: true,
      transferId
    });
  });

  app.post('/v1/quotes', async (request, reply) => {
    try {
      const payload = createQuoteSchema.parse(request.body);
      const idempotencyKey = requiredIdempotencyKey(request);

      const response = await withIdempotency({
        scope: 'core-api:quotes:create',
        idempotencyKey,
        requestId: request.id,
        requestPayload: payload,
        execute: async () => {
          const result = await quoteRoutes.create(payload);
          return {
            status: result.status,
            body: result.body
          };
        }
      });

      return reply.status(response.status).send(response.body);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'QUOTE_CREATE_FAILED',
        message: (error as Error).message,
        status: 400
      });
    }
  });

  app.get('/v1/quotes/:quoteId', async (request, reply) => {
    const params = request.params as { quoteId: string };
    const result = await quoteRoutes.get(params.quoteId);
    return reply.status(result.status).send(result.body);
  });

  app.post('/internal/v1/funding-confirmed', async (request, reply) => {
    let claims: AuthClaims;

    try {
      claims = toAuthClaims(request);
      assertTokenType(claims, ['service', 'admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const timestampMs = request.headers['x-callback-timestamp'];
    const signature = request.headers['x-callback-signature'];
    if (typeof timestampMs !== 'string' || typeof signature !== 'string') {
      return deny({
        request,
        reply,
        code: 'INVALID_SIGNATURE_HEADERS',
        message: 'Missing callback signature headers.',
        status: 401
      });
    }

    const callbackSecret = process.env.WATCHER_CALLBACK_SECRET ?? 'dev-callback-secret-change-me';
    const payloadText = JSON.stringify(request.body ?? {});
    const validSignature = verifySignedPayloadSignature({
      payload: payloadText,
      timestampMs,
      signatureHex: signature,
      secret: callbackSecret,
      maxAgeMs: Number(process.env.WATCHER_CALLBACK_MAX_AGE_MS ?? 300000)
    });

    if (!validSignature) {
      return deny({
        request,
        reply,
        code: 'INVALID_CALLBACK_SIGNATURE',
        message: 'Callback signature verification failed.',
        status: 401
      });
    }

    const parsed = fundingCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_FUNDING_EVENT',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const idempotencyKey =
      (typeof request.headers['idempotency-key'] === 'string' && request.headers['idempotency-key']) || parsed.data.eventId;

    const response = await withIdempotency({
      scope: 'core-api:funding-confirmed',
      idempotencyKey,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const result = await fundingService.processFundingConfirmed({
          ...parsed.data,
          confirmedAt: new Date(parsed.data.confirmedAt)
        });

        return {
          status: result.status === 'confirmed' ? 202 : 200,
          body: {
            result,
            acceptedBy: claims.sub
          }
        };
      }
    });

    return reply.status(response.status).send(response.body);
  });

  app.get('/internal/v1/ops/transfers', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const query = request.query as { status?: string; limit?: string };
    const rawLimit = Number(query.limit ?? '50');
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const statusFilter = query.status;

    const rows = await getPool().query(
      `
      select transfer_id, quote_id, sender_id, receiver_id, chain, token, send_amount_usd, status, created_at
      from transfers
      where ($1::text is null or status = $1)
      order by created_at desc
      limit $2
      `,
      [statusFilter ?? null, limit]
    );

    return reply.send({
      items: rows.rows,
      count: rows.rowCount ?? 0
    });
  });

  app.get('/internal/v1/ops/transfers/:transferId', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const { transferId } = request.params as { transferId: string };

    const transfer = await getPool().query('select * from transfers where transfer_id = $1 limit 1', [transferId]);
    if (!transfer.rows[0]) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: `Transfer ${transferId} not found.`,
        status: 404
      });
    }

    const transitions = await getPool().query(
      'select from_state, to_state, metadata, occurred_at from transfer_transition where transfer_id = $1 order by id asc',
      [transferId]
    );
    const payout = await getPool().query('select * from payout_instruction where transfer_id = $1 limit 1', [transferId]);
    const funding = await getPool().query('select * from onchain_funding_event where transfer_id = $1 limit 1', [transferId]);

    return reply.send({
      transfer: transfer.rows[0],
      transitions: transitions.rows,
      payout: payout.rows[0] ?? null,
      funding: funding.rows[0] ?? null
    });
  });

  app.get('/internal/v1/ops/sla/breaches', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const thresholdMinutes = Number(process.env.PAYOUT_SLA_MINUTES ?? '10');

    const rows = await getPool().query(
      `
      select
        t.transfer_id,
        ofe.confirmed_at,
        pse.created_at as payout_initiated_at,
        extract(epoch from (pse.created_at - ofe.confirmed_at)) / 60 as minutes_to_payout
      from transfers t
      join onchain_funding_event ofe on ofe.transfer_id = t.transfer_id
      join payout_status_event pse on pse.transfer_id = t.transfer_id and pse.to_status = 'PAYOUT_INITIATED'
      where (pse.created_at - ofe.confirmed_at) > ($1 * interval '1 minute')
      order by minutes_to_payout desc
      `,
      [thresholdMinutes]
    );

    return reply.send({
      thresholdMinutes,
      breaches: rows.rows
    });
  });

  app.get('/internal/v1/ops/reconciliation/runs/:runId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_run_read_denied',
        entityType: 'reconciliation_run',
        entityId: (request.params as { runId?: string }).runId ?? 'unknown',
        reason: (error as Error).message
      });
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const runId = (request.params as { runId: string }).runId;
    const response = await forwardToReconciliationWorker({
      path: `/internal/v1/ops/reconciliation/runs/${runId}`,
      method: 'GET',
      actor: claims.sub,
      command: 'reconciliation run get'
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.get('/internal/v1/ops/reconciliation/issues', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_issues_read_denied',
        entityType: 'reconciliation_issue',
        entityId: 'list',
        reason: (error as Error).message
      });
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const query = request.query as { since?: string; limit?: string };
    const queryString = new URLSearchParams();
    if (query.since) {
      queryString.set('since', query.since);
    }
    if (query.limit) {
      queryString.set('limit', query.limit);
    }

    const response = await forwardToReconciliationWorker({
      path: `/internal/v1/ops/reconciliation/issues${queryString.toString().length > 0 ? `?${queryString.toString()}` : ''}`,
      method: 'GET',
      actor: claims.sub,
      command: 'reconciliation issues list'
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/reconciliation/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_run_denied',
        entityType: 'reconciliation_run',
        entityId: 'trigger',
        reason: (error as Error).message
      });
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = reconciliationRunSchema.safeParse(request.body);
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

    const idempotencyKey = requiredIdempotencyKey(request);
    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/reconciliation/run',
      method: 'POST',
      actor: claims.sub,
      command: typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'reconciliation run',
      idempotencyKey,
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/jobs/retention/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = reconciliationRunSchema.pick({ reason: true }).safeParse(request.body);
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

    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/jobs/retention/run',
      method: 'POST',
      actor: claims.sub,
      command: 'retention run',
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/jobs/key-verification/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = reconciliationRunSchema.pick({ reason: true }).safeParse(request.body);
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

    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/jobs/key-verification/run',
      method: 'POST',
      actor: claims.sub,
      command: 'key verification run',
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/kyc/receivers/upsert', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin', 'compliance_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'receiver_kyc_upsert_denied',
        entityType: 'receiver_kyc_profile',
        entityId: 'unknown',
        reason: (error as Error).message
      });
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = receiverKycUpsertSchema.safeParse(request.body);
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

    const upsertInput = {
      receiverId: parsed.data.receiverId,
      kycStatus: parsed.data.kycStatus,
      nationalIdVerified: parsed.data.nationalIdVerified,
      ...(parsed.data.nationalId ? { nationalIdPlaintext: parsed.data.nationalId } : {})
    };

    const profile = await receiverKycService.upsert(upsertInput);

    await auditService.append({
      actorType: 'admin',
      actorId: claims.sub,
      action: 'receiver_kyc_upsert',
      entityType: 'receiver_kyc_profile',
      entityId: profile.receiverId,
      reason: parsed.data.reason,
      metadata: {
        kycStatus: profile.kycStatus,
        nationalIdVerified: profile.nationalIdVerified
      }
    });

    return reply.status(200).send({
      receiverId: profile.receiverId,
      kycStatus: profile.kycStatus,
      nationalIdVerified: profile.nationalIdVerified,
      updatedAt: profile.updatedAt.toISOString()
    });
  });

  app.get('/internal/v1/kyc/receivers/:receiverId', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const receiverId = (request.params as { receiverId: string }).receiverId;
    const profile = await receiverKycService.getByReceiverId(receiverId);
    if (!profile) {
      return deny({
        request,
        reply,
        code: 'RECEIVER_KYC_NOT_FOUND',
        message: `Receiver KYC profile ${receiverId} not found.`,
        status: 404
      });
    }

    return reply.send({
      receiverId: profile.receiverId,
      kycStatus: profile.kycStatus,
      nationalIdVerified: profile.nationalIdVerified,
      nationalIdHash: profile.nationalIdHash,
      updatedAt: profile.updatedAt.toISOString()
    });
  });

  app.post('/internal/v1/ops/payouts/:transferId/retry', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const bodyParse = retryPayoutSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: bodyParse.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: bodyParse.error.issues
      });
    }

    const transferId = (request.params as { transferId: string }).transferId;
    const existing = await getPool().query('select * from payout_instruction where transfer_id = $1 limit 1', [transferId]);
    const payoutInstruction = existing.rows[0] as
      | {
        method: 'bank' | 'telebirr';
        recipient_account_ref: string;
        amount_etb: string;
      }
      | undefined;

    if (!payoutInstruction) {
      return deny({
        request,
        reply,
        code: 'PAYOUT_NOT_FOUND',
        message: `No payout instruction for transfer ${transferId}.`,
        status: 404
      });
    }

    const commandText = typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'payout retry';
    const actorHeader = typeof request.headers['x-ops-actor'] === 'string' ? request.headers['x-ops-actor'] : claims.sub;

    await auditService.append({
      actorType: 'admin',
      actorId: claims.sub,
      action: 'ops_payout_retry_requested',
      entityType: 'transfer',
      entityId: transferId,
      reason: bodyParse.data.reason,
      metadata: {
        actor: actorHeader,
        command: commandText,
        method: payoutInstruction.method
      }
    });

    const retryKey = `ops-retry:${transferId}:${Date.now()}`;
    const orchestratorUrl = process.env.PAYOUT_ORCHESTRATOR_URL ?? 'http://localhost:3003';
    const response = await fetch(`${orchestratorUrl}/internal/v1/payouts/initiate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: request.headers.authorization ?? '',
        'idempotency-key': retryKey,
        'x-ops-command': commandText,
        'x-ops-actor': actorHeader
      },
      body: JSON.stringify({
        transferId,
        method: payoutInstruction.method,
        recipientAccountRef: payoutInstruction.recipient_account_ref,
        amountEtb: Number(payoutInstruction.amount_etb),
        idempotencyKey: retryKey
      })
    });

    const responseBody = (await response.json().catch(() => ({ error: { message: 'Invalid orchestrator response.' } }))) as unknown;
    return reply.status(response.status).send(responseBody);
  });

  app.post('/internal/v1/ops/transfers/:transferId/mark-reviewed', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const bodyParse = markReviewedSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: bodyParse.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: bodyParse.error.issues
      });
    }

    const transferId = (request.params as { transferId: string }).transferId;
    const status = await getPool().query('select status from transfers where transfer_id = $1 limit 1', [transferId]);
    const row = status.rows[0] as { status: string } | undefined;

    if (!row) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: `Transfer ${transferId} not found.`,
        status: 404
      });
    }

    await getPool().query(
      `
      insert into transfer_transition (transfer_id, from_state, to_state, metadata)
      values ($1, $2, $3, $4)
      `,
      [
        transferId,
        row.status,
        row.status,
        {
          note: 'Manual review acknowledgment',
          actor: claims.sub
        }
      ]
    );

    const commandText = typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'transfer mark-reviewed';
    const actorHeader = typeof request.headers['x-ops-actor'] === 'string' ? request.headers['x-ops-actor'] : claims.sub;

    await auditService.append({
      actorType: 'admin',
      actorId: claims.sub,
      action: 'ops_transfer_mark_reviewed',
      entityType: 'transfer',
      entityId: transferId,
      reason: bodyParse.data.reason,
      metadata: {
        actor: actorHeader,
        command: commandText
      }
    });

    return reply.send({
      transferId,
      status: row.status,
      reviewedBy: claims.sub
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;

    log('error', 'core-api unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
