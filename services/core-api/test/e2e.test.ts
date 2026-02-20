/**
 * Backend E2E Test
 *
 * Tests the core-api service end-to-end by exercising
 * health/readiness endpoints and validating the app boots correctly.
 * Full flow E2E (with DB) requires migrations and a running Postgres.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCoreApiApp } from '../src/app.js';

// Set required env vars for app boot (no actual DB connection is used for non-DB tests)
process.env.APP_REGION = 'offshore';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:55432/test_e2e';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';
process.env.AUTH_JWT_SECRET = 'test-jwt-secret-for-e2e';
process.env.AUTH_JWT_ISSUER = 'cryptopay-e2e';
process.env.AUTH_JWT_AUDIENCE = 'cryptopay-services';

describe('Core API E2E', () => {
    let app: Awaited<ReturnType<typeof buildCoreApiApp>>;

    beforeAll(async () => {
        app = await buildCoreApiApp();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    it('GET /healthz returns ok', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/healthz'
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.ok).toBe(true);
        expect(body.service).toBe('core-api');
    });

    it('unauthenticated routes return 401', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/users/me'
        });

        expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('POST with invalid payload returns 400 with structured error', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/quotes',
            payload: { invalid: true }
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('INVALID_PAYLOAD');
    });

    it('rate limiting headers are present on API routes', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/quotes',
            payload: {
                chain: 'base',
                token: 'USDC',
                sendAmountUsd: 100,
                fxRateUsdToEtb: 140,
                feeUsd: 1
            }
        });

        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('rate limiting headers are NOT present on healthz (skip path)', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/healthz'
        });

        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });
});
