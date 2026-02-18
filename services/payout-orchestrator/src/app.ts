import { BankPayoutAdapter, TelebirrPayoutAdapter } from '@cryptopay/adapters';
import { assertHasRole, assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { createServiceMetrics, log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PayoutRepository, PayoutService } from './modules/payouts/index.js';
import { verifyWebhookSignature, type WebhookVerifierConfig } from './webhook-verifier.js';

const statusCallbackSchema = z.object({
  payoutId: z.string().min(1),
  providerReference: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  errorMessage: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const initiateSchema = z.object({
  transferId: z.string().min(1),
  method: z.enum(['bank', 'telebirr']),
  recipientAccountRef: z.string().min(3),
  amountEtb: z.number().positive(),
  idempotencyKey: z.string().min(8)
});

function sha256(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function authClaims(request: FastifyRequest): AuthClaims {
  const previousSecret = process.env.AUTH_JWT_PREVIOUS_SECRET;
  return authenticateBearerToken({
    authorizationHeader: request.headers.authorization,
    secret: process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me',
    secrets: previousSecret ? [previousSecret] : [],
    issuer: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services'
  });
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
  return params.reply.status(params.status ?? 400).send(errorEnvelope(params.request, params.code, params.message, params.details));
}

async function withIdempotency(params: {
  scope: string;
  idempotencyKey: string;
  requestId: string;
  requestPayload: unknown;
  execute: () => Promise<{ status: number; body: unknown }>;
}): Promise<{ status: number; body: unknown }> {
  const key = `${params.scope}:${params.idempotencyKey}`;
  const hash = sha256(params.requestPayload);

  const existing = await getPool().query('select request_hash, response_status, response_body from idempotency_record where key = $1', [key]);
  const row = existing.rows[0] as
    | {
      request_hash: string;
      response_status: number;
      response_body: unknown;
    }
    | undefined;

  if (row) {
    if (row.request_hash !== hash) {
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
    [key, hash, result.status, result.body, expiresAt]
  );

  return result;
}

export async function buildPayoutOrchestratorApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const metrics = createServiceMetrics('payout-orchestrator');
  const repository = new PayoutRepository();
  const service = new PayoutService(repository, {
    bank: new BankPayoutAdapter(async (_request, idempotencyKey) => ({
      providerReference: `bank_ref_${idempotencyKey}`,
      acceptedAt: new Date()
    })),
    telebirr: new TelebirrPayoutAdapter(process.env.PAYOUT_TELEBIRR_ENABLED === 'true')
  });

  // Webhook signature verification config (optional, feature-flagged)
  const webhookSignatureEnabled = process.env.BANK_WEBHOOK_SIGNATURE_ENABLED === 'true';
  const webhookConfig: WebhookVerifierConfig | null = webhookSignatureEnabled
    ? {
      secret: process.env.BANK_WEBHOOK_SECRET ?? '',
      maxAgeMs: Number(process.env.BANK_WEBHOOK_MAX_AGE_MS ?? '300000'),
      signatureHeader: process.env.BANK_WEBHOOK_SIG_HEADER ?? 'x-webhook-signature',
      timestampHeader: process.env.BANK_WEBHOOK_TS_HEADER ?? 'x-webhook-timestamp'
    }
    : null;

  // Register raw body content type for webhook signature verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try {
      const json = JSON.parse(body as string) as unknown;
      // Store raw body for webhook signature verification
      (_request as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      done(null, json);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

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

  app.get('/healthz', async () => ({ ok: true, service: 'payout-orchestrator' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.post('/internal/v1/payouts/initiate', async (request, reply) => {
    try {
      const claims = authClaims(request);
      assertTokenType(claims, ['service', 'admin']);
      if (claims.tokenType === 'admin') {
        assertHasRole(claims, ['ops_admin']);
      }
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = initiateSchema.safeParse(request.body);
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

    const headerKey = request.headers['idempotency-key'];
    if (!headerKey || typeof headerKey !== 'string') {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const response = await withIdempotency({
      scope: 'payout-orchestrator:initiate',
      idempotencyKey: headerKey,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const result = await service.initiatePayout(parsed.data);
        return {
          status: result.status === 'initiated' ? 202 : 200,
          body: result
        };
      }
    });

    return reply.status(response.status).send(response.body);
  });

  // ── Payout status callback (bank webhook) ──
  app.post('/internal/v1/payouts/status-callback', async (request, reply) => {
    // Optional webhook signature verification
    if (webhookConfig) {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
      const result = verifyWebhookSignature({
        body: rawBody,
        headers: request.headers as Record<string, string | string[] | undefined>,
        config: webhookConfig
      });

      if (!result.valid) {
        log('warn', 'Webhook signature verification failed', {
          reason: result.reason,
          requestId: request.id
        });
        return deny({
          request,
          reply,
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: result.reason ?? 'Invalid webhook signature.',
          status: 401
        });
      }
    } else {
      // Fallback: require service JWT when signature verification is off
      try {
        const claims = authClaims(request);
        assertTokenType(claims, ['service']);
      } catch (error) {
        return deny({
          request,
          reply,
          code: 'UNAUTHORIZED',
          message: (error as Error).message,
          status: 401
        });
      }
    }

    const parsed = statusCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid callback payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const { payoutId, providerReference, status, errorMessage, metadata } = parsed.data;

    const instruction = await repository.findByPayoutId(payoutId);
    if (!instruction) {
      return deny({
        request,
        reply,
        code: 'PAYOUT_NOT_FOUND',
        message: `No payout instruction found for ${payoutId}.`,
        status: 404
      });
    }

    // Idempotent: if already in terminal state, return success
    if (instruction.status === 'PAYOUT_COMPLETED' || instruction.status === 'PAYOUT_FAILED') {
      log('info', 'Payout status callback received for terminal payout (idempotent)', {
        payoutId,
        currentStatus: instruction.status,
        callbackStatus: status
      });
      return reply.status(200).send({
        payoutId,
        status: instruction.status === 'PAYOUT_COMPLETED' ? 'completed' : 'failed',
        message: 'Already processed.'
      });
    }

    if (instruction.status !== 'PAYOUT_INITIATED') {
      return deny({
        request,
        reply,
        code: 'PAYOUT_STATE_INVALID',
        message: `Payout ${payoutId} is in state ${instruction.status}, expected PAYOUT_INITIATED.`,
        status: 409
      });
    }

    if (status === 'completed') {
      await repository.markCompleted({
        instruction,
        providerReference,
        metadata
      });

      log('info', 'Payout completed via callback', {
        payoutId,
        transferId: instruction.transferId,
        providerReference
      });

      return reply.status(200).send({
        payoutId,
        transferId: instruction.transferId,
        status: 'completed'
      });
    }

    // status === 'failed'
    await repository.markFailed({
      instruction,
      errorMessage: errorMessage ?? 'Payout failed (no details from provider)',
      metadata
    });

    log('warn', 'Payout failed via callback', {
      payoutId,
      transferId: instruction.transferId,
      errorMessage
    });

    return reply.status(200).send({
      payoutId,
      transferId: instruction.transferId,
      status: 'failed'
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;

    log('error', 'payout-orchestrator unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
