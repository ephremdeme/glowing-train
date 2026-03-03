import { errorEnvelope, registerServiceMetrics } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import Fastify, { type FastifyInstance } from 'fastify';

export async function buildBaseSweeperWorkerApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const metrics = registerServiceMetrics(app, 'base-sweeper-worker');

  app.get('/healthz', async () => ({ ok: true, service: 'base-sweeper-worker' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;
    log('error', 'base-sweeper-worker unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });
    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
