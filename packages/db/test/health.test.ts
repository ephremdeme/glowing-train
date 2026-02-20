import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, dbHealthcheck } from '../src/client.js';

describe('database healthcheck', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';
  });

  afterAll(async () => {
    await closeDb();
  });

  it('connects to postgres and returns ok', async () => {
    await expect(dbHealthcheck()).resolves.toBe(true);
  });
});
