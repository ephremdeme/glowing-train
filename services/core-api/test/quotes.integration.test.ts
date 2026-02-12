import { closePool, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QuoteExpiredError, QuoteRepository, QuoteService } from '../src/modules/quotes/index.js';
import { buildQuoteRoutes } from '../src/routes/quotes.js';

async function applyQuoteTableMigration(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    create table if not exists quotes (
      quote_id text primary key,
      chain text not null check (chain in ('base', 'solana')),
      token text not null check (token in ('USDC', 'USDT')),
      send_amount_usd numeric(12, 2) not null check (send_amount_usd > 0 and send_amount_usd <= 2000),
      fx_rate_usd_to_etb numeric(18, 6) not null check (fx_rate_usd_to_etb > 0),
      fee_usd numeric(12, 2) not null check (fee_usd >= 0),
      recipient_amount_etb numeric(14, 2) not null check (recipient_amount_etb >= 0),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
}

describe('quotes integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    await applyQuoteTableMigration();
  });

  beforeEach(async () => {
    await getPool().query('truncate table quotes');
  });

  afterAll(async () => {
    await closePool();
  });

  it('persists and retrieves a quote', async () => {
    const service = new QuoteService(new QuoteRepository());

    const created = await service.createQuote({
      chain: 'base',
      token: 'USDT',
      sendAmountUsd: 250,
      fxRateUsdToEtb: 139,
      feeUsd: 2,
      expiresInSeconds: 180
    });

    const loaded = await service.getQuote(created.quoteId);

    expect(loaded.quoteId).toBe(created.quoteId);
    expect(loaded.sendAmountUsd).toBe(250);
    expect(loaded.recipientAmountEtb).toBe(34472);
  });

  it('returns explicit QUOTE_EXPIRED code when used after expiry', async () => {
    const service = new QuoteService(new QuoteRepository());
    const now = new Date('2026-02-12T00:00:00.000Z');

    const created = await service.createQuote(
      {
        chain: 'solana',
        token: 'USDC',
        sendAmountUsd: 120,
        fxRateUsdToEtb: 130,
        feeUsd: 1,
        expiresInSeconds: 20
      },
      now
    );

    await expect(service.getQuoteForTransfer(created.quoteId, new Date('2026-02-12T00:01:00.000Z'))).rejects.toBeInstanceOf(
      QuoteExpiredError
    );

    await expect(service.getQuoteForTransfer(created.quoteId, new Date('2026-02-12T00:01:00.000Z'))).rejects.toMatchObject({
      code: 'QUOTE_EXPIRED'
    });
  });

  it('quote route create/get returns expected status and body', async () => {
    const routes = buildQuoteRoutes(new QuoteService(new QuoteRepository()));

    const createResponse = await routes.create({
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 300,
      fxRateUsdToEtb: 138,
      feeUsd: 3,
      expiresInSeconds: 120
    });

    expect(createResponse.status).toBe(201);
    if (!('quoteId' in createResponse.body)) {
      throw new Error('Expected success response body for create quote route.');
    }

    const getResponse = await routes.get(createResponse.body.quoteId);

    expect(getResponse.status).toBe(200);
    if (!('quoteId' in getResponse.body)) {
      throw new Error('Expected success response body for get quote route.');
    }
    expect(getResponse.body.quoteId).toBe(createResponse.body.quoteId);
  });
});
