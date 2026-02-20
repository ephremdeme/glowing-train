import { assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, errorEnvelope, registerServiceMetrics, withIdempotency } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { TransferRepository, TransferService } from './modules/transfers/index.js';
import { buildTransferRoutes } from './routes/transfers.js';

const createTransferSchema = z.object({
  quoteId: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  senderKycStatus: z.enum(['approved', 'pending', 'rejected']),
  receiverKycStatus: z.enum(['approved', 'pending', 'rejected']),
  receiverNationalIdVerified: z.boolean(),
  idempotencyKey: z.string().min(8)
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
  const transferRoutes = buildTransferRoutes(new TransferService(new TransferRepository()));

  app.get('/healthz', async () => ({ ok: true, service: 'offshore-collector' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.post('/v1/transfers', async (request, reply) => {
    const parsed = createTransferSchema.safeParse(request.body);
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
      const key = requiredIdempotencyKey(request);

      const response = await withIdempotency({
        db: { query },
        scope: 'offshore-collector:transfers:create',
        idempotencyKey: key,
        requestId: request.id,
        requestPayload: parsed.data,
        execute: async () => {
          const result = await transferRoutes.create(parsed.data);
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
        code: 'TRANSFER_CREATE_FAILED',
        message: (error as Error).message,
        status: 400
      });
    }
  });

  app.post('/internal/v1/transfers/create', async (request, reply) => {
    try {
      const claims = toAuthClaims(request);
      assertScope(claims, 'collector:transfers:create');
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = createTransferSchema.safeParse(request.body);
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
      const key = requiredIdempotencyKey(request);

      const response = await withIdempotency({
        db: { query },
        scope: 'offshore-collector:internal:transfers:create',
        idempotencyKey: key,
        requestId: request.id,
        requestPayload: parsed.data,
        execute: async () => {
          const result = await transferRoutes.create(parsed.data);
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
        code: 'TRANSFER_CREATE_FAILED',
        message: (error as Error).message,
        status: 400
      });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;

    log('error', 'offshore-collector unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
