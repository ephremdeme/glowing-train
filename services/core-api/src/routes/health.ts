import { deepHealthCheck } from '@cryptopay/observability';
import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(
  app: FastifyInstance,
  metrics: {
    registry: {
      contentType: string;
      metrics: () => Promise<string> | string;
    };
  }
): void {
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
}
