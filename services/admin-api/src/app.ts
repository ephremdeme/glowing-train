/**
 * Admin/Ops Dashboard API
 *
 * Provides read-only operational endpoints for the ops team
 * to monitor transfer/payout health, review flagged items,
 * and view system metrics.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { query } from '@cryptopay/db';
import { createServiceMetrics, deepHealthCheck, log } from '@cryptopay/observability';

export async function buildAdminApiApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    const metrics = createServiceMetrics('admin-api');

    // ── Health ──
    app.get('/healthz', async () => ({ ok: true, service: 'admin-api' }));
    app.get('/readyz', async (_request, reply) => {
        const health = await deepHealthCheck('admin-api');
        return reply.status(health.status === 'unhealthy' ? 503 : 200).send(health);
    });

    // ── Dashboard: Transfer Summary ──
    app.get('/admin/v1/transfers/summary', async (request, reply) => {
        const result = await query(`
      select
        status,
        count(*)::int as count,
        coalesce(sum(send_amount_usd), 0)::numeric as total_usd
      from transfers
      group by status
      order by count desc
    `);

        return reply.send({
            summary: result.rows,
            generatedAt: new Date().toISOString()
        });
    });

    // ── Dashboard: Payout Summary ──
    app.get('/admin/v1/payouts/summary', async (request, reply) => {
        const result = await query(`
      select
        status,
        count(*)::int as count,
        coalesce(sum(amount_etb), 0)::numeric as total_etb
      from payout_instruction
      group by status
      order by count desc
    `);

        return reply.send({
            summary: result.rows,
            generatedAt: new Date().toISOString()
        });
    });

    // ── Dashboard: Review Queue (transfers/payouts needing ops attention) ──
    app.get('/admin/v1/review-queue', async (request, reply) => {
        const [transfers, payouts] = await Promise.all([
            query(`
        select transfer_id, status, created_at, updated_at, send_amount_usd
        from transfers
        where status = 'PAYOUT_REVIEW_REQUIRED'
        order by updated_at asc
        limit 50
      `),
            query(`
        select instruction_id, transfer_id, status, amount_etb, last_error, attempt_count, updated_at
        from payout_instruction
        where status = 'PAYOUT_REVIEW_REQUIRED'
        order by updated_at asc
        limit 50
      `)
        ]);

        return reply.send({
            transfers: { count: transfers.rowCount, items: transfers.rows },
            payouts: { count: payouts.rowCount, items: payouts.rows }
        });
    });

    // ── Dashboard: Recent Audit Log ──
    app.get('/admin/v1/audit-log', async (request, reply) => {
        const limit = Math.min(Number((request.query as Record<string, string>).limit ?? 50), 200);

        const result = await query(`
      select id, actor_type, actor_id, action, entity_type, entity_id, reason, created_at
      from audit_log
      order by created_at desc
      limit $1
    `, [limit]);

        return reply.send({
            entries: result.rows,
            count: result.rowCount
        });
    });

    // ── Dashboard: SLA Breaches ──
    app.get('/admin/v1/sla-breaches', async (request, reply) => {
        const result = await query(`
      select entity_id as transfer_id, reason, metadata, created_at
      from audit_log
      where action = 'sla_breach_detected'
      order by created_at desc
      limit 50
    `);

        return reply.send({
            breaches: result.rows,
            count: result.rowCount
        });
    });

    // ── Dashboard: Expired Transfers ──
    app.get('/admin/v1/transfers/expired', async (request, reply) => {
        const result = await query(`
      select transfer_id, created_at, updated_at, send_amount_usd
      from transfers
      where status = 'EXPIRED'
      order by updated_at desc
      limit 50
    `);

        return reply.send({
            expired: result.rows,
            count: result.rowCount
        });
    });

    // ── Metrics ──
    app.addHook('onResponse', async (request, reply) => {
        const route = request.routeOptions.url ?? request.url;
        const status = String(reply.statusCode);
        metrics.requestCount.labels(request.method, route, status).inc();
    });

    app.get('/metrics', async (_request, reply) => {
        reply.header('content-type', metrics.registry.contentType);
        return metrics.registry.metrics();
    });

    return app;
}
