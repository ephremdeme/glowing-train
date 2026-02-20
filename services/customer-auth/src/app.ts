import { registerCors, registerServiceMetrics } from '@cryptopay/http';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerBetterAuthRoutes } from './modules/better-auth/routes.js';

export interface CustomerAuthAppOptions {
  // Reserved for future provider adapters.
}

export async function buildCustomerAuthApp(_options?: CustomerAuthAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const metrics = registerServiceMetrics(app, 'customer-auth');
  await registerCors(app);

  app.get('/healthz', async () => ({ ok: true, service: 'customer-auth' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  registerBetterAuthRoutes(app);

  return app;
}
