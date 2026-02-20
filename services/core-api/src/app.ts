import {
  assertTokenType,
  authenticateBearerToken,
  createHs256Jwt,
  createRateLimiter,
  registerVersionHeaders,
  type AuthClaims
} from '@cryptopay/auth';
import { registerCors, errorEnvelope, registerServiceMetrics } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import { ExchangeRateApiProvider } from '@cryptopay/adapters';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AuditService } from './modules/audit/index.js';
import { FundingConfirmationRepository, FundingConfirmationService } from './modules/funding-confirmations/index.js';
import { QuoteRepository, QuoteService } from './modules/quotes/index.js';
import { ReceiverKycRepository, ReceiverKycService } from './modules/receiver-kyc/index.js';
import { registerCustomerProfileRoutes } from './routes/customer-profile.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerInternalFundingRoutes } from './routes/internal-funding.js';
import { registerKycRoutes } from './routes/kyc.js';
import { registerOpsRoutes } from './routes/ops.js';
import { registerQuoteApiRoutes } from './routes/quote-api.js';
import { buildQuoteRoutes } from './routes/quotes.js';
import { registerRecipientRoutes } from './routes/recipients.js';
import { registerTransferRoutes } from './routes/transfers.js';
import { registerWatcherRoutes } from './routes/watchers.js';

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

export async function buildCoreApiApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await registerCors(app);
  registerVersionHeaders(app);

  const generalLimiter = createRateLimiter({
    max: Number(process.env['RATE_LIMIT_MAX'] ?? 200),
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000)
  });
  generalLimiter.register(app);

  const metrics = registerServiceMetrics(app, 'core-api');
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

  registerHealthRoutes(app, metrics);

  registerCustomerProfileRoutes(app, {
    toCustomerClaims,
    meUpdateSchema,
    auditService
  });

  registerRecipientRoutes(app, {
    toCustomerClaims,
    recipientCreateSchema,
    recipientUpdateSchema,
    receiverKycService,
    auditService
  });

  registerKycRoutes(app, {
    toCustomerClaims,
    toAuthClaims,
    requiredIdempotencyKey,
    senderKycWebhookSchema,
    receiverKycUpsertSchema,
    auditService,
    receiverKycService
  });

  registerTransferRoutes(app, {
    toCustomerClaims,
    requiredIdempotencyKey,
    transferListQuerySchema,
    transferCreateSchema,
    buildInternalServiceToken
  });

  registerWatcherRoutes(app, {
    toAuthClaims,
    assertScope,
    watcherCheckpointSchema,
    watcherDedupeSchema,
    watcherRouteResolveSchema
  });

  registerQuoteApiRoutes(app, {
    createQuoteSchema,
    requiredIdempotencyKey,
    quoteRoutes
  });

  registerInternalFundingRoutes(app, {
    toAuthClaims,
    fundingCallbackSchema,
    fundingService
  });

  registerOpsRoutes(app, {
    toAuthClaims,
    requiredIdempotencyKey,
    forwardToReconciliationWorker,
    reconciliationRunSchema,
    retryPayoutSchema,
    markReviewedSchema,
    auditService
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
