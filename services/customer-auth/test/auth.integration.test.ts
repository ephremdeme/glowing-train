import { createHs256Jwt } from '@cryptopay/auth';
import { closePool, getPool } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCustomerAuthApp } from '../src/app.js';

function buildInternalServiceToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return createHs256Jwt(
    {
      sub: 'core-api',
      iss: 'cryptopay-internal',
      aud: 'cryptopay-services',
      exp: now + 300,
      iat: now,
      tokenType: 'service',
      scope: ['customer-auth:proxy']
    },
    process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me'
  );
}

describe('customer-auth integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me';
    process.env.AUTH_JWT_ISSUER = process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal';
    process.env.AUTH_JWT_AUDIENCE = process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services';
    process.env.DATA_KEY_ID = process.env.DATA_KEY_ID ?? 'test-key';
    process.env.DATA_KEY_VERSION = process.env.DATA_KEY_VERSION ?? 'v1';

    await getPool().query(`
      create table if not exists idempotency_record (
        key text primary key,
        request_hash text not null,
        response_status integer not null,
        response_body jsonb not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
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
      );
    `);

    await getPool().query(`
      create table if not exists customer_account (
        customer_id text primary key,
        full_name text not null,
        country_code text not null,
        status text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await getPool().query(`
      create table if not exists customer_auth_identity (
        id bigserial primary key,
        customer_id text not null references customer_account(customer_id) on delete cascade,
        provider text not null,
        provider_subject text,
        email text,
        phone_e164 text,
        password_hash text,
        verified_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await getPool().query(`
      create table if not exists customer_session (
        session_id text primary key,
        customer_id text not null references customer_account(customer_id) on delete cascade,
        refresh_token_hash text not null unique,
        csrf_token_hash text not null,
        issued_at timestamptz not null default now(),
        expires_at timestamptz not null,
        rotated_from text,
        revoked_at timestamptz,
        ip text,
        user_agent text
      );
    `);

    await getPool().query(`
      create table if not exists auth_challenge (
        challenge_id text primary key,
        type text not null,
        target text not null,
        code_hash text,
        token_hash text,
        expires_at timestamptz not null,
        attempt_count integer not null default 0,
        consumed_at timestamptz,
        metadata jsonb,
        created_at timestamptz not null default now()
      );
    `);

    await getPool().query(`
      create table if not exists customer_mfa_totp (
        customer_id text primary key references customer_account(customer_id) on delete cascade,
        secret_encrypted jsonb not null,
        recovery_codes_hash jsonb not null default '[]'::jsonb,
        enabled_at timestamptz,
        disabled_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
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
      );
    `);
  });

  beforeEach(async () => {
    await getPool().query('truncate table customer_session cascade');
    await getPool().query('truncate table customer_auth_identity cascade');
    await getPool().query('truncate table sender_kyc_profile cascade');
    await getPool().query('truncate table customer_mfa_totp cascade');
    await getPool().query('truncate table auth_challenge cascade');
    await getPool().query('truncate table customer_account cascade');
    await getPool().query('truncate table idempotency_record cascade');
    await getPool().query('truncate table audit_log cascade');
  });

  afterAll(async () => {
    await closePool();
  });

  it('registers a customer and returns session payload', async () => {
    const app = await buildCustomerAuthApp();
    const res = await app.inject({
      method: 'POST',
      url: '/internal/v1/auth/register',
      headers: {
        'x-service-authorization': `Bearer ${buildInternalServiceToken()}`,
        'idempotency-key': 'idem-register-001'
      },
      payload: {
        fullName: 'Alice Customer',
        countryCode: 'ET',
        email: 'alice@example.com',
        password: 'Password123!'
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { customer: { customerId: string }; session: { accessToken: string; refreshToken: string; csrfToken: string } };
    expect(body.customer.customerId).toMatch(/^cust_/);
    expect(body.session.accessToken.length).toBeGreaterThan(10);
    expect(body.session.refreshToken.length).toBeGreaterThan(10);
    expect(body.session.csrfToken.length).toBeGreaterThan(10);

    await app.close();
  });

  it('logs in with password after registration', async () => {
    const app = await buildCustomerAuthApp();
    const headers = {
      'x-service-authorization': `Bearer ${buildInternalServiceToken()}`,
      'idempotency-key': 'idem-register-002'
    };

    const register = await app.inject({
      method: 'POST',
      url: '/internal/v1/auth/register',
      headers,
      payload: {
        fullName: 'Bob Customer',
        countryCode: 'ET',
        email: 'bob@example.com',
        password: 'Password123!'
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/internal/v1/auth/login/password',
      headers: {
        'x-service-authorization': `Bearer ${buildInternalServiceToken()}`
      },
      payload: {
        email: 'bob@example.com',
        password: 'Password123!'
      }
    });

    expect(login.statusCode).toBe(200);
    const body = login.json() as { session: { accessToken: string } };
    expect(body.session.accessToken).toContain('.');

    await app.close();
  });

  it('rotates refresh token', async () => {
    const app = await buildCustomerAuthApp();
    const register = await app.inject({
      method: 'POST',
      url: '/internal/v1/auth/register',
      headers: {
        'x-service-authorization': `Bearer ${buildInternalServiceToken()}`,
        'idempotency-key': 'idem-register-003'
      },
      payload: {
        fullName: 'Charlie Customer',
        countryCode: 'ET',
        email: 'charlie@example.com',
        password: 'Password123!'
      }
    });
    const registerBody = register.json() as { session: { refreshToken: string; csrfToken: string } };

    const refresh = await app.inject({
      method: 'POST',
      url: '/internal/v1/auth/refresh',
      headers: {
        'x-service-authorization': `Bearer ${buildInternalServiceToken()}`
      },
      payload: {
        refreshToken: registerBody.session.refreshToken,
        csrfToken: registerBody.session.csrfToken
      }
    });

    expect(refresh.statusCode).toBe(200);
    const refreshBody = refresh.json() as { session: { refreshToken: string } };
    expect(refreshBody.session.refreshToken).not.toBe(registerBody.session.refreshToken);

    await app.close();
  });
});
