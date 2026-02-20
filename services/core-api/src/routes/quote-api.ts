import { query } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export function registerQuoteApiRoutes(
  app: FastifyInstance,
  deps: {
    createQuoteSchema: any;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    quoteRoutes: {
      create: (payload: unknown) => Promise<{ status: number; body: unknown }>;
      get: (quoteId: string) => Promise<{ status: number; body: unknown }>;
    };
  }
): void {
  const { createQuoteSchema, requiredIdempotencyKey, quoteRoutes } = deps;
  app.post('/v1/quotes', async (request, reply) => {
    const parsed = createQuoteSchema.safeParse(request.body);
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

    let idempotencyKey: string;
    try {
      idempotencyKey = requiredIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }

    try {
      const response = await withIdempotency({
        db: { query },
        scope: 'core-api:quotes:create',
        idempotencyKey,
        requestId: request.id,
        requestPayload: parsed.data,
        execute: async () => {
          const result = await quoteRoutes.create(parsed.data);
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
        code: 'QUOTE_CREATE_FAILED',
        message: (error as Error).message,
        status: 400
      });
    }
  });

  app.get('/v1/quotes/:quoteId', async (request, reply) => {
    const params = request.params as { quoteId: string };
    const result = await quoteRoutes.get(params.quoteId);
    return reply.status(result.status).send(result.body);
  });
}
