import { assertHasRole, assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { createServiceMetrics, deepHealthCheck, log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { runKeyVerification } from './jobs/key-verification.js';
import { runRetentionJob } from './jobs/retention.js';
import { ReconciliationService } from './modules/reconcile/index.js';
import { z } from 'zod';

const runSchema = z.object({
  reason: z.string().min(3),
  outputPath: z.string().min(1).optional()
});

const jobRunSchema = z.object({
  reason: z.string().min(3)
});

function sha256(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function parseAuth(request: FastifyRequest): AuthClaims {
  const previousSecret = process.env.AUTH_JWT_PREVIOUS_SECRET;
  return authenticateBearerToken({
    authorizationHeader: request.headers.authorization,
    secret: process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me',
    secrets: previousSecret ? [previousSecret] : [],
    issuer: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services'
  });
}

function assertOpsReadAuthorized(claims: AuthClaims): void {
  if (claims.tokenType === 'service') {
    const scopes = claims.scope ?? [];
    if (!scopes.includes('ops:reconciliation:proxy')) {
      throw new Error('Forbidden: missing reconciliation proxy scope.');
    }
    return;
  }

  assertTokenType(claims, ['admin']);
  assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
}

function assertOpsWriteAuthorized(claims: AuthClaims): void {
  if (claims.tokenType === 'service') {
    const scopes = claims.scope ?? [];
    if (!scopes.includes('ops:reconciliation:proxy')) {
      throw new Error('Forbidden: missing reconciliation proxy scope.');
    }
    return;
  }

  assertTokenType(claims, ['admin']);
  assertHasRole(claims, ['ops_admin']);
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

function runtimeVersion(service: string): Record<string, string> {
  return {
    service,
    releaseId: process.env.RELEASE_ID ?? 'dev',
    gitSha: process.env.GIT_SHA ?? 'local',
    deployColor: process.env.DEPLOY_COLOR ?? 'local',
    environment: process.env.ENVIRONMENT ?? process.env.NODE_ENV ?? 'development'
  };
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
            message: 'Idempotency key reused with a different payload.',
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

async function appendAudit(input: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getPool().query(
    `
    insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
    values ($1, $2, $3, $4, $5, $6, $7)
    `,
    ['admin', input.actorId, input.action, input.entityType, input.entityId, input.reason, input.metadata ?? null]
  );
}

export async function buildReconciliationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const metrics = createServiceMetrics('reconciliation-worker');
  const service = new ReconciliationService();

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

  app.get('/healthz', async () => ({ ok: true, service: 'reconciliation-worker' }));
  app.get('/readyz', async (_request, reply) => {
    const health = await deepHealthCheck('reconciliation-worker');
    const status = health.status === 'unhealthy' ? 503 : 200;
    return reply.status(status).send({
      ok: health.status !== 'unhealthy',
      ...health
    });
  });
  app.get('/version', async () => runtimeVersion('reconciliation-worker'));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.get('/internal/v1/ops/reconciliation/runs/:runId', async (request, reply) => {
    try {
      const claims = parseAuth(request);
      assertOpsReadAuthorized(claims);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const runId = (request.params as { runId: string }).runId;
    const run = await getPool().query('select * from reconciliation_run where run_id = $1 limit 1', [runId]);

    if (!run.rows[0]) {
      return deny({
        request,
        reply,
        code: 'RECONCILIATION_RUN_NOT_FOUND',
        message: `Run ${runId} not found.`,
        status: 404
      });
    }

    const issues = await getPool().query(
      'select transfer_id, issue_code, details, detected_at from reconciliation_issue where run_id = $1 order by id asc',
      [runId]
    );

    return reply.send({
      run: run.rows[0],
      issues: issues.rows
    });
  });

  app.get('/internal/v1/ops/reconciliation/issues', async (request, reply) => {
    try {
      const claims = parseAuth(request);
      assertOpsReadAuthorized(claims);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const query = request.query as { since?: string; limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? '200'), 1), 1000);

    const sinceDate = query.since ? new Date(query.since) : null;
    if (sinceDate && Number.isNaN(sinceDate.valueOf())) {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: 'Invalid since datetime value.',
        status: 400
      });
    }

    const result = await getPool().query(
      `
      select ri.run_id, ri.transfer_id, ri.issue_code, ri.details, ri.detected_at
      from reconciliation_issue ri
      where ($1::timestamptz is null or ri.detected_at >= $1)
      order by ri.detected_at desc
      limit $2
      `,
      [sinceDate ? sinceDate.toISOString() : null, limit]
    );

    return reply.send({
      items: result.rows,
      count: result.rowCount ?? 0
    });
  });

  app.post('/internal/v1/ops/reconciliation/run', async (request, reply) => {
    let claims: AuthClaims;

    try {
      claims = parseAuth(request);
      assertOpsWriteAuthorized(claims);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = runSchema.safeParse(request.body);
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

    const idempotencyHeader = request.headers['idempotency-key'];
    if (!idempotencyHeader || typeof idempotencyHeader !== 'string') {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const commandText = typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'recon run';
    const actorHeader = typeof request.headers['x-ops-actor'] === 'string' ? request.headers['x-ops-actor'] : claims.sub;

    const result = await withIdempotency({
      scope: 'reconciliation-worker:run',
      idempotencyKey: idempotencyHeader,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const run = await service.runOnce(parsed.data.outputPath);

        await appendAudit({
          actorId: claims.sub,
          action: 'ops_reconciliation_run_triggered',
          entityType: 'reconciliation_run',
          entityId: run.runId,
          reason: parsed.data.reason,
          metadata: {
            actor: actorHeader,
            command: commandText,
            outputPath: parsed.data.outputPath ?? null,
            issueCount: run.issueCount
          }
        });

        return {
          status: 202,
          body: {
            runId: run.runId,
            issueCount: run.issueCount,
            csv: run.csv
          }
        };
      }
    });

    return reply.status(result.status).send(result.body);
  });

  app.post('/internal/v1/ops/jobs/retention/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = parseAuth(request);
      assertOpsWriteAuthorized(claims);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = jobRunSchema.safeParse(request.body);
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

    const result = await runRetentionJob();

    await appendAudit({
      actorId: claims.sub,
      action: 'ops_retention_job_triggered',
      entityType: 'job',
      entityId: 'retention',
      reason: parsed.data.reason,
      metadata: { ...result }
    });

    return reply.send({
      status: 'completed',
      result
    });
  });

  app.post('/internal/v1/ops/jobs/key-verification/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = parseAuth(request);
      assertOpsWriteAuthorized(claims);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = jobRunSchema.safeParse(request.body);
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

    const result = await runKeyVerification();

    await appendAudit({
      actorId: claims.sub,
      action: 'ops_key_verification_job_triggered',
      entityType: 'job',
      entityId: 'key_verification',
      reason: parsed.data.reason,
      metadata: { ...result }
    });

    return reply.send({
      status: result.ok ? 'healthy' : 'degraded',
      result
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;

    log('error', 'reconciliation-worker unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
