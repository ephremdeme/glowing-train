import { authenticateBearerToken } from '@cryptopay/auth';
import { closeDb, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCustomerAuthApp } from '../src/app.js';

async function ensureTables(): Promise<void> {
  await getPool().query(`
    create table if not exists customer_account (
      customer_id text primary key,
      full_name text not null,
      country_code text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists sender_kyc_profile (
      customer_id text primary key references customer_account(customer_id) on delete cascade,
      provider text not null,
      applicant_id text,
      kyc_status text not null,
      reason_code text,
      last_reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists "user" (
      id text primary key,
      name text not null,
      email text not null unique,
      email_verified boolean not null default false,
      image text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists account (
      id text primary key,
      account_id text not null,
      provider_id text not null,
      user_id text not null references "user"(id) on delete cascade,
      access_token text,
      refresh_token text,
      id_token text,
      access_token_expires_at timestamptz,
      refresh_token_expires_at timestamptz,
      scope text,
      password text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider_id, account_id)
    )
  `);

  await getPool().query(`
    create table if not exists session (
      id text primary key,
      token text not null unique,
      user_id text not null references "user"(id) on delete cascade,
      expires_at timestamptz not null,
      ip_address text,
      user_agent text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists verification (
      id text primary key,
      identifier text not null,
      value text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists customer_auth_link (
      user_id text not null unique references "user"(id) on delete cascade,
      customer_id text not null unique references customer_account(customer_id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await getPool().query(`
    create table if not exists idempotency_record (
      key text primary key,
      request_hash text not null,
      response_status integer not null,
      response_body jsonb not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )
  `);

  await getPool().query(`
    create table if not exists audit_log (
      id bigserial primary key,
      actor_type text not null,
      actor_id text not null,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      reason text,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `);
}

describe('customer-auth token exchange', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = process.env.APP_REGION ?? 'ethiopia';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:56379';
    process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me';
    process.env.AUTH_JWT_ISSUER = process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal';
    process.env.AUTH_JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services';
    process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? 'dev-better-auth-secret-change-me';
    process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'mock-google-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? 'mock-google-client-secret';

    await ensureTables();
  });

  beforeEach(async () => {
    await getPool().query('truncate table customer_auth_link cascade');
    await getPool().query('truncate table session cascade');
    await getPool().query('truncate table account cascade');
    await getPool().query('truncate table verification cascade');
    await getPool().query('truncate table "user" cascade');
    await getPool().query('truncate table sender_kyc_profile cascade');
    await getPool().query('truncate table customer_account cascade');
    await getPool().query('truncate table idempotency_record cascade');
    await getPool().query('truncate table audit_log cascade');
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects exchange without active session', async () => {
    const app = await buildCustomerAuthApp();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/session/exchange',
      payload: {}
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('issues short-lived customer JWT from active cookie session', async () => {
    const app = await buildCustomerAuthApp();

    const signup = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: {
        'idempotency-key': 'idem-exchange-001'
      },
      payload: {
        fullName: 'Token Exchange Customer',
        countryCode: 'ET',
        email: 'exchange@example.com',
        password: 'Password123!'
      }
    });

    expect(signup.statusCode).toBe(201);
    const setCookie = signup.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const exchange = await app.inject({
      method: 'POST',
      url: '/auth/session/exchange',
      headers: {
        cookie: Array.isArray(setCookie) ? setCookie[0] : String(setCookie)
      },
      payload: {}
    });

    expect(exchange.statusCode).toBe(200);
    const body = exchange.json() as { token: string; customerId: string; sessionId: string };
    expect(body.token).toContain('.');
    expect(body.customerId).toBeTruthy();
    expect(body.sessionId).toBeTruthy();

    const claims = authenticateBearerToken({
      authorizationHeader: `Bearer ${body.token}`,
      secret: process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me',
      issuer: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
      audience: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services'
    });

    expect(claims.tokenType).toBe('customer');
    expect(claims.sub).toBe(body.customerId);
    expect(claims.sessionId).toBe(body.sessionId);
    expect(claims.mfa).toBe(false);
    expect(Array.isArray(claims.amr)).toBe(true);
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(300);

    await app.close();
  });
});
