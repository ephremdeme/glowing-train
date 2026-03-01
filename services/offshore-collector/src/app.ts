import { assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, errorEnvelope, registerServiceMetrics, withIdempotency } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BasePaymentVerificationError, BasePaymentVerificationService } from './modules/base-payments/index.js';
import { SolanaPaymentVerificationError, SolanaPaymentVerificationService } from './modules/solana-payments/index.js';
import { Create2DepositStrategy, TransferRepository, TransferService } from './modules/transfers/index.js';
import { buildTransferRoutes } from './routes/transfers.js';

const createTransferSchema = z.object({
  quoteId: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  senderKycStatus: z.enum(['approved', 'pending', 'rejected']),
  receiverKycStatus: z.enum(['approved', 'pending', 'rejected']).optional(),
  receiverNationalIdVerified: z.boolean().optional(),
  idempotencyKey: z.string().min(8)
});

const paymentVerifySchema = z.object({
  transferId: z.string().min(1),
  txHash: z.string().min(1)
});

function requiredIdempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    throw new Error('Missing idempotency-key header.');
  }
  return key;
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

function assertScope(claims: AuthClaims, scope: string): void {
  assertTokenType(claims, ['service']);
  const scopes = claims.scope ?? [];
  if (!scopes.includes(scope)) {
    throw new Error(`Forbidden: missing required scope ${scope}.`);
  }
}

export async function buildOffshoreCollectorApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const metrics = registerServiceMetrics(app, 'offshore-collector');
  const transferRepository = new TransferRepository();
  const transferRoutes = buildTransferRoutes(
    new TransferService(transferRepository, new Create2DepositStrategy())
  );
  const solanaPaymentVerifier = new SolanaPaymentVerificationService(transferRepository);
  const basePaymentVerifier = new BasePaymentVerificationService(transferRepository);

  app.get('/healthz', async () => ({ ok: true, service: 'offshore-collector' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // ── Transfer creation ──────────────────────────────────────────────

  app.post('/v1/transfers', async (request, reply) => {
    const parsed = createTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({ request, reply, code: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid payload.', status: 400, details: parsed.error.issues });
    }

    try {
      const key = requiredIdempotencyKey(request);
      const response = await withIdempotency({
        db: { query }, scope: 'offshore-collector:transfers:create', idempotencyKey: key,
        requestId: request.id, requestPayload: parsed.data,
        execute: async () => { const result = await transferRoutes.create(parsed.data); return { status: result.status, body: result.body }; }
      });
      return reply.status(response.status).send(response.body);
    } catch (error) {
      return deny({ request, reply, code: 'TRANSFER_CREATE_FAILED', message: (error as Error).message, status: 400 });
    }
  });

  app.post('/internal/v1/transfers/create', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'collector:transfers:create');
    } catch (error) {
      return deny({ request, reply, code: 'FORBIDDEN', message: (error as Error).message, status: 403 });
    }

    const parsed = createTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({ request, reply, code: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid payload.', status: 400, details: parsed.error.issues });
    }

    try {
      const key = requiredIdempotencyKey(request);
      const response = await withIdempotency({
        db: { query }, scope: 'offshore-collector:internal:transfers:create', idempotencyKey: key,
        requestId: request.id, requestPayload: parsed.data,
        execute: async () => { const result = await transferRoutes.create(parsed.data); return { status: result.status, body: result.body }; }
      });
      return reply.status(response.status).send(response.body);
    } catch (error) {
      return deny({ request, reply, code: 'TRANSFER_CREATE_FAILED', message: (error as Error).message, status: 400 });
    }
  });

  // ── Solana payment verification ────────────────────────────────────

  app.post('/internal/v1/transfers/solana-payment/verify', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'collector:solana-payments:verify');
    } catch (error) {
      return deny({ request, reply, code: 'FORBIDDEN', message: (error as Error).message, status: 403 });
    }

    const parsed = paymentVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({ request, reply, code: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid payload.', status: 400, details: parsed.error.issues });
    }

    const idempotencyKey =
      (typeof request.headers['idempotency-key'] === 'string' && request.headers['idempotency-key']) ||
      `solana-verify:${parsed.data.transferId}:${parsed.data.txHash}`;

    try {
      const response = await withIdempotency({
        db: { query }, scope: 'offshore-collector:internal:solana-payment:verify', idempotencyKey,
        requestId: request.id, requestPayload: parsed.data,
        execute: async () => ({ status: 200, body: await solanaPaymentVerifier.verify(parsed.data) })
      });
      return reply.status(response.status).send(response.body);
    } catch (error) {
      if (error instanceof SolanaPaymentVerificationError) {
        return deny({ request, reply, code: error.code, message: error.message, status: error.status });
      }
      return deny({ request, reply, code: 'SOLANA_PAYMENT_VERIFY_FAILED', message: (error as Error).message, status: 500 });
    }
  });

  // ── Base payment verification ──────────────────────────────────────

  app.post('/internal/v1/transfers/base-payment/verify', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'collector:base-payments:verify');
    } catch (error) {
      return deny({ request, reply, code: 'FORBIDDEN', message: (error as Error).message, status: 403 });
    }

    const parsed = paymentVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({ request, reply, code: 'INVALID_PAYLOAD', message: parsed.error.issues[0]?.message ?? 'Invalid payload.', status: 400, details: parsed.error.issues });
    }

    const idempotencyKey =
      (typeof request.headers['idempotency-key'] === 'string' && request.headers['idempotency-key']) ||
      `base-verify:${parsed.data.transferId}:${parsed.data.txHash}`;

    try {
      const response = await withIdempotency({
        db: { query }, scope: 'offshore-collector:internal:base-payment:verify', idempotencyKey,
        requestId: request.id, requestPayload: parsed.data,
        execute: async () => ({ status: 200, body: await basePaymentVerifier.verify(parsed.data) })
      });
      return reply.status(response.status).send(response.body);
    } catch (error) {
      if (error instanceof BasePaymentVerificationError) {
        return deny({ request, reply, code: error.code, message: error.message, status: error.status });
      }
      return deny({ request, reply, code: 'BASE_PAYMENT_VERIFY_FAILED', message: (error as Error).message, status: 500 });
    }
  });

  // ── Error handler ──────────────────────────────────────────────────

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;
    log('error', 'offshore-collector unhandled error', { message: err.message, stack: err.stack, requestId: request.id });
    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
