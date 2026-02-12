import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from '../src/env.js';

describe('loadRuntimeConfig', () => {
  it('loads valid configuration', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      APP_REGION: 'offshore',
      DATABASE_URL: 'postgres://cryptopay:cryptopay@localhost:5432/cryptopay',
      REDIS_URL: 'redis://localhost:6379',
      ETHIOPIA_SERVICES_CRYPTO_DISABLED: 'true',
      MAX_TRANSFER_USD: '2000',
      PAYOUT_SLA_MINUTES: '10'
    });

    expect(config.MAX_TRANSFER_USD).toBe(2000);
    expect(config.ETHIOPIA_SERVICES_CRYPTO_DISABLED).toBe(true);
  });

  it('rejects disabling Ethiopia crypto guardrail', () => {
    expect(() =>
      loadRuntimeConfig({
        APP_REGION: 'ethiopia',
        DATABASE_URL: 'postgres://cryptopay:cryptopay@localhost:5432/cryptopay',
        REDIS_URL: 'redis://localhost:6379',
        ETHIOPIA_SERVICES_CRYPTO_DISABLED: 'false'
      })
    ).toThrow(/must remain true/);
  });
});
