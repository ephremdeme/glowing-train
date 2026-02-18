/**
 * CORS configuration for Fastify.
 *
 * Handles preflight (OPTIONS) requests and sets appropriate
 * Access-Control-* headers on all responses.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface CorsConfig {
    /** Allowed origins (default: [] — no cross-origin). Use '*' for open, or specific domains. */
    allowedOrigins: string[];
    /** Allowed HTTP methods (default: common set). */
    allowedMethods?: string[];
    /** Allowed headers. */
    allowedHeaders?: string[];
    /** Exposed headers (returned to client). */
    exposedHeaders?: string[];
    /** Enable credentials (cookies, auth headers). */
    credentials?: boolean;
    /** Preflight cache duration in seconds (default: 86400 = 24h). */
    maxAge?: number;
}

function defaultConfig(): CorsConfig {
    const origins = process.env.CORS_ALLOWED_ORIGINS;
    return {
        allowedOrigins: origins ? origins.split(',').map((o) => o.trim()) : [],
        allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'Idempotency-Key',
            'X-Request-Id',
            'X-CSRF-Token'
        ],
        exposedHeaders: [
            'X-RateLimit-Limit',
            'X-RateLimit-Remaining',
            'X-RateLimit-Reset',
            'X-Request-Id'
        ],
        credentials: true,
        maxAge: 86400
    };
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
    if (!origin) return false;
    if (allowedOrigins.includes('*')) return true;
    return allowedOrigins.some((allowed) => {
        if (allowed.startsWith('*.')) {
            // Wildcard subdomain: *.example.com matches sub.example.com
            const domain = allowed.slice(2);
            return origin.endsWith(domain) && origin.charAt(origin.length - domain.length - 1) === '.';
        }
        return origin === allowed;
    });
}

export function registerCors(app: FastifyInstance, config: CorsConfig = defaultConfig()): void {
    const {
        allowedOrigins,
        allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders = ['Content-Type', 'Authorization'],
        exposedHeaders = [],
        credentials = true,
        maxAge = 86400
    } = config;

    // Skip if no origins configured
    if (allowedOrigins.length === 0) {
        return;
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

        // Handle preflight requests
        if (request.method === 'OPTIONS' && origin) {
            reply.header('access-control-allow-methods', allowedMethods.join(', '));
            reply.header('access-control-allow-headers', allowedHeaders.join(', '));
            reply.header('access-control-max-age', String(maxAge));
            return reply.status(204).send();
        }
    });
}
