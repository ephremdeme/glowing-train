import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

function defaultConfig(): CorsConfig {
  const origins = process.env.CORS_ALLOWED_ORIGINS;
  return {
    allowedOrigins: origins ? origins.split(',').map((origin) => origin.trim()) : [],
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-CSRF-Token'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Request-Id'],
    credentials: true,
    maxAge: 86_400
  };
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;

  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain) && origin.charAt(origin.length - domain.length - 1) === '.';
    }
    return origin === allowed;
  });
}

export async function registerCors(app: FastifyInstance, config: CorsConfig = defaultConfig()): Promise<void> {
  const {
    allowedOrigins,
    allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    exposedHeaders = [],
    credentials = true,
    maxAge = 86_400
  } = config;

  if (allowedOrigins.length === 0) {
    return;
  }

  const fastifyCorsModule = process.env.FASTIFY_CORS_MODULE ?? '@fastify/cors';

  try {
    const loaded = (await import(fastifyCorsModule as string)) as { default?: unknown };
    const plugin = loaded.default ?? loaded;

    await app.register(plugin as never, {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        callback(null, isOriginAllowed(origin, allowedOrigins));
      },
      methods: allowedMethods,
      allowedHeaders,
      exposedHeaders,
      credentials,
      maxAge
    });
    return;
  } catch {
    // Fallback when @fastify/cors is unavailable in local environments.
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;

    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');

      if (credentials) {
        reply.header('access-control-allow-credentials', 'true');
      }

      if (exposedHeaders.length > 0) {
        reply.header('access-control-expose-headers', exposedHeaders.join(', '));
      }
    }

    if (request.method === 'OPTIONS' && origin) {
      reply.header('access-control-allow-methods', allowedMethods.join(', '));
      reply.header('access-control-allow-headers', allowedHeaders.join(', '));
      reply.header('access-control-max-age', String(maxAge));
      return reply.status(204).send();
    }
  });
}
