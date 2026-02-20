import { assertHasRole, assertTokenType, authenticateBearerToken, type AuthClaims } from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { appendAuditLog, deny, errorEnvelope, registerServiceMetrics, withIdempotency } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
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

export async function buildReconciliationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const metrics = registerServiceMetrics(app, 'reconciliation-worker');
  const service = new ReconciliationService();

  app.get('/healthz', async () => ({ ok: true, service: 'reconciliation-worker' }));
  app.get('/readyz', async () => ({ ok: true }));
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
      db: getPool(),
      scope: 'reconciliation-worker:run',
      idempotencyKey: idempotencyHeader,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const run = await service.runOnce(parsed.data.outputPath);

        await appendAuditLog({
          db: getPool(),
          actorType: 'admin',
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

    await appendAuditLog({
      db: getPool(),
      actorType: 'admin',
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

    await appendAuditLog({
      db: getPool(),
      actorType: 'admin',
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
