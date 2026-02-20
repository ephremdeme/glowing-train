import type { FastifyInstance } from 'fastify';
import { createServiceMetrics } from '@cryptopay/observability';

export function registerServiceMetrics(app: FastifyInstance, serviceName: string) {
  const metrics = createServiceMetrics(serviceName);

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

  return metrics;
}
