/**
 * In-memory sliding-window rate limiter for Fastify.
 *
 * Limits requests per IP (or custom key extractor) within a configurable
 * time window. Designed for single-instance use; for distributed deployments,
 * replace with a Redis-backed store.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { log } from '@cryptopay/observability';

export interface RateLimitConfig {
    /** Maximum requests per window (default: 100). */
    max: number;
    /** Window size in ms (default: 60_000 = 1 min). */
    windowMs: number;
    /** Extract rate-limit key from request (default: IP address). */
    keyExtractor?: (request: FastifyRequest) => string;
    /** Optional list of path prefixes to skip (e.g. /healthz, /readyz). */
    skipPaths?: string[];
    /** Optional custom response message (default: 'Too many requests'). */
    message?: string;
}

interface WindowEntry {
    count: number;
    resetAt: number;
}

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
    const max = config.max ?? 100;
    const windowMs = config.windowMs ?? 60_000;
    const keyExtractor = config.keyExtractor ?? defaultKeyExtractor;
    const skipPaths = config.skipPaths ?? ['/healthz', '/readyz', '/metrics'];
    const message = config.message ?? 'Too many requests, please try again later.';

    const store = new Map<string, WindowEntry>();

    // Periodic cleanup every 5 windows
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            if (entry.resetAt <= now) {
                store.delete(key);
            }
        }
    }, windowMs * 5);

    // Don't prevent Node from exiting
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return {
        register(app: FastifyInstance): void {
            app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
                const path = request.url.split('?')[0] ?? '';
                if (skipPaths.some((prefix) => path.startsWith(prefix))) {
                    return;
                }

                const key = keyExtractor(request);
                const now = Date.now();
                let entry = store.get(key);

                if (!entry || entry.resetAt <= now) {
                    entry = { count: 0, resetAt: now + windowMs };
                    store.set(key, entry);
                }

                entry.count += 1;

                // Set rate-limit headers
                const remaining = Math.max(0, max - entry.count);
                const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
                reply.header('x-ratelimit-limit', max);
                reply.header('x-ratelimit-remaining', remaining);
                reply.header('x-ratelimit-reset', resetSeconds);

                if (entry.count > max) {
                    log('warn', 'Rate limit exceeded', {
                        key,
                        path,
                        method: request.method,
                        count: entry.count,
                        max
                    });

                    reply.header('retry-after', resetSeconds);
                    return reply.status(429).send({
                        error: {
                            code: 'RATE_LIMIT_EXCEEDED',
                            message,
                            retryAfterSeconds: resetSeconds
                        }
                    });
                }
            });
        },

        /** Expose store size for monitoring. */
        get storeSize(): number {
            return store.size;
        },

        /** Clear all entries (useful for testing). */
        clear(): void {
            store.clear();
        }
    };
}

/** Stricter rate limiter preset for auth endpoints. */
export function createAuthRateLimiter(overrides: Partial<RateLimitConfig> = {}) {
    return createRateLimiter({
        max: overrides.max ?? 10,
        windowMs: overrides.windowMs ?? 60_000,
        message: overrides.message ?? 'Too many authentication attempts, please try again later.',
        ...overrides
    });
}

function defaultKeyExtractor(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0]?.trim() ?? request.ip;
    }
    return request.ip;
}
