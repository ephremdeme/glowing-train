import type { FxRateProvider } from '@cryptopay/adapters';
import { log } from '@cryptopay/observability';
import type { FastifyInstance } from 'fastify';

export function registerFxRoutes(
  app: FastifyInstance,
  deps: {
    fxProvider: FxRateProvider;
  }
): void {
  app.get('/v1/fx/usd-etb', async (_request, reply) => {
    try {
      const fx = await deps.fxProvider.getRate('USD', 'ETB');
      return reply.status(200).send({
        base: 'USD',
        quote: 'ETB',
        rate: fx.rate,
        fetchedAt: fx.fetchedAt.toISOString(),
        source: fx.source
      });
    } catch (error) {
      log('warn', 'FX rate request failed', {
        pair: 'USD/ETB',
        error: (error as Error).message
      });

      return reply.status(503).send({
        error: {
          code: 'FX_RATE_UNAVAILABLE',
          message: 'FX rate is temporarily unavailable. Please try again.'
        }
      });
    }
  });
}
