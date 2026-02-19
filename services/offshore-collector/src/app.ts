import { assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { createServiceMetrics, deepHealthCheck, log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
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

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function requiredIdempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (!key || typeof key !== 'string') {
    throw new Error('Missing idempotency-key header.');
  }
  return key;
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

async function withIdempotency(params: {
  scope: string;
  idempotencyKey: string;
  requestId: string;
  requestPayload: unknown;
  execute: () => Promise<{ status: number; body: unknown }>;
}): Promise<{ status: number; body: unknown }> {
  const key = `${params.scope}:${params.idempotencyKey}`;
  const requestHash = hashPayload(params.requestPayload);

  const existing = await getPool().query('select request_hash, response_status, response_body from idempotency_record where key = $1', [key]);
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
            message: 'Idempotency key reused with different payload.',
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

  const result = await params.execute();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  await getPool().query(
    `
    insert into idempotency_record (key, request_hash, response_status, response_body, expires_at)
    values ($1, $2, $3, $4, $5)
    on conflict (key) do nothing
    `,
    [key, requestHash, result.status, result.body, expiresAt]
  );

  return result;
}

function deny(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}): FastifyReply {
  return params.reply.status(params.status ?? 400).send(errorEnvelope(params.request, params.code, params.message, params.details));
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

function runtimeVersion(service: string): Record<string, string> {
  return {
    service,
    releaseId: process.env.RELEASE_ID ?? 'dev',
    gitSha: process.env.GIT_SHA ?? 'local',
    deployColor: process.env.DEPLOY_COLOR ?? 'local',
    environment: process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'
  };
}

export async function buildOffshoreCollectorApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const metrics = createServiceMetrics('offshore-collector');
  const transferRoutes = buildTransferRoutes(new TransferService(new TransferRepository()));

  app.addHook('onRequest', async (request) => {
    request.headers['x-request-start'] = String(Date.now());
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = Number(request.headers['x-request-start'] ?? Date.now());
    const duration = Math.max(Date.now() - started, 0);
    const route = request.routeOptions.url ?? request.url;
    const status = String(reply.statusCode);

    metrics.requestDurationMs.labels(request.method, route, status).observe(duration);
    metrics.requestCount.labels(request.method, route, status).inc();

    if (reply.statusCode >= 400) {
      metrics.errorCount.labels(status).inc();
    }
  });

  app.get('/healthz', async () => ({ ok: true, service: 'offshore-collector' }));
  app.get('/readyz', async (_request, reply) => {
    const health = await deepHealthCheck('offshore-collector');
    const status = health.status === 'unhealthy' ? 503 : 200;
    return reply.status(status).send({
      ok: health.status !== 'unhealthy',
      ...health
    });
  });
  app.get('/version', async () => runtimeVersion('offshore-collector'));
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
