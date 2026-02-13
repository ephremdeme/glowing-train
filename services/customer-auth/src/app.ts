import {
  assertTokenType,
  authenticateBearerToken,
  createHs256Jwt,
  type AuthClaims
} from '@cryptopay/auth';
import { getPool } from '@cryptopay/db';
import { createServiceMetrics, log } from '@cryptopay/observability';
import { decryptField, encryptField, LocalDevKeyProvider, type EncryptedField, type KeyProvider } from '@cryptopay/security';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const scryptAsync = promisify(scrypt);

const registerSchema = z
  .object({
    fullName: z.string().min(1),
    countryCode: z.string().min(2).max(3),
    email: z.string().email().optional(),
    phoneE164: z.string().min(8).max(20).optional(),
    password: z.string().min(8).max(200).optional()
  })
  .refine((value) => Boolean(value.email || value.phoneE164), {
    message: 'Either email or phoneE164 is required.',
    path: ['email']
  });

const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional()
});

const emailMagicRequestSchema = z.object({
  email: z.string().email()
});

const emailMagicVerifySchema = z.object({
  challengeId: z.string().min(1),
  token: z.string().min(6),
  totpCode: z.string().length(6).optional()
});

const phoneOtpRequestSchema = z.object({
  phoneE164: z.string().min(8).max(20)
});

const phoneOtpVerifySchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().length(6),
  totpCode: z.string().length(6).optional()
});

const googleStartSchema = z.object({
  redirectUri: z.string().url().optional()
});

const googleCallbackSchema = z.object({
  state: z.string().min(1),
  code: z.string().min(1)
});

const totpEnableSchema = z.object({
  code: z.string().length(6)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  csrfToken: z.string().min(8)
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional()
});

type SessionIssue = {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: string;
};

type CustomerRow = {
  customer_id: string;
  full_name: string;
  country_code: string;
  status: 'active' | 'disabled';
};

type IdentityRow = {
  id: number;
  customer_id: string;
  provider: 'email_password' | 'email_magic' | 'phone_otp' | 'google';
  provider_subject: string | null;
  email: string | null;
  phone_e164: string | null;
  password_hash: string | null;
  verified_at: Date | null;
};

type SessionRow = {
  session_id: string;
  customer_id: string;
  refresh_token_hash: string;
  csrf_token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

function envAuth(): { secret: string; previousSecret?: string; issuer: string; audience: string } {
  return {
    secret: process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me',
    ...(process.env.AUTH_JWT_PREVIOUS_SECRET ? { previousSecret: process.env.AUTH_JWT_PREVIOUS_SECRET } : {}),
    issuer: process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal',
    audience: process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services'
  };
}

function accessTtlSeconds(): number {
  const value = Number(process.env.AUTH_CUSTOMER_ACCESS_TTL_SECONDS ?? '900');
  return Number.isFinite(value) && value > 0 ? value : 900;
}

function refreshTtlSeconds(): number {
  const value = Number(process.env.AUTH_CUSTOMER_REFRESH_TTL_SECONDS ?? String(30 * 24 * 3600));
  return Number.isFinite(value) && value > 0 ? value : 30 * 24 * 3600;
}

function buildKeyProvider(): KeyProvider {
  const base64Key = process.env.DATA_KEY_B64;

  return new LocalDevKeyProvider({
    keyId: process.env.DATA_KEY_ID ?? 'dev-key',
    keyVersion: process.env.DATA_KEY_VERSION ?? 'v1',
    ...(base64Key ? { base64Key } : {})
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim();
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}

function randomToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function errorEnvelope(request: FastifyRequest, code: string, message: string, details?: unknown): { error: Record<string, unknown> } {
  const error: Record<string, unknown> = {
    code,
    message,
    requestId: request.id
  };

  if (details !== undefined) {
    error.details = details;
  }

  return { error };
}

function deny(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}): FastifyReply {
  return params.reply.status(params.status ?? 400).send(errorEnvelope(params.request, params.code, params.message, params.details));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split('$');
  if (!salt || !hashHex) {
    return false;
  }

  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

function hotp(secretHex: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = Buffer.from(secretHex, 'hex');
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const lastByte = digest[digest.length - 1];
  if (lastByte === undefined) {
    return '000000';
  }

  const offset = lastByte & 0x0f;
  const code = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(code % 1_000_000).padStart(6, '0');
}

function verifyTotpCode(secretHex: string, code: string, now = Date.now()): boolean {
  const counter = Math.floor(now / 1000 / 30);
  const windows = [counter - 1, counter, counter + 1];
  for (const value of windows) {
    if (hotp(secretHex, value) === code) {
      return true;
    }
  }
  return false;
}

function parseIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  if (!value || typeof value !== 'string') {
    throw new Error('Missing idempotency-key header.');
  }
  return value;
}

function sessionContext(request: FastifyRequest): { ip: string; userAgent?: string } {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {})
  };
}

async function withIdempotency(params: {
  scope: string;
  idempotencyKey: string;
  requestId: string;
  payload: unknown;
  execute: () => Promise<{ status: number; body: unknown }>;
}): Promise<{ status: number; body: unknown }> {
  const pool = getPool();
  const key = `${params.scope}:${params.idempotencyKey}`;
  const requestHash = sha256(JSON.stringify(params.payload));

  const existing = await pool.query('select request_hash, response_status, response_body from idempotency_record where key = $1', [key]);
  const row = existing.rows[0] as
    | {
        request_hash: string;
        response_status: number;
        response_body: unknown;
      }
    | undefined;

  if (row) {
    if (row.request_hash !== requestHash) {
      return {
        status: 409,
        body: {
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key reused with a different payload.',
            requestId: params.requestId
          }
        }
      };
    }

    return {
      status: row.response_status,
      body: row.response_body
    };
  }

  const result = await params.execute();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await pool.query(
    `
    insert into idempotency_record (key, request_hash, response_status, response_body, expires_at)
    values ($1, $2, $3, $4, $5)
    on conflict (key) do nothing
    `,
    [key, requestHash, result.status, result.body, expiresAt]
  );

  return result;
}

function requireInternalService(request: FastifyRequest): AuthClaims {
  const raw = request.headers['x-service-authorization'];
  const authorizationHeader = typeof raw === 'string' ? raw : undefined;

  const env = envAuth();
  const claims = authenticateBearerToken({
    authorizationHeader,
    secret: env.secret,
    secrets: env.previousSecret ? [env.previousSecret] : [],
    issuer: env.issuer,
    audience: env.audience
  });
  assertTokenType(claims, ['service']);

  const scopes = claims.scope ?? [];
  if (!scopes.includes('customer-auth:proxy')) {
    throw new Error('Forbidden: missing customer-auth proxy scope.');
  }

  return claims;
}

function requireCustomerClaims(request: FastifyRequest): AuthClaims {
  const env = envAuth();
  const claims = authenticateBearerToken({
    authorizationHeader: request.headers.authorization,
    secret: env.secret,
    secrets: env.previousSecret ? [env.previousSecret] : [],
    issuer: env.issuer,
    audience: env.audience
  });
  assertTokenType(claims, ['customer']);
  return claims;
}

async function appendAudit(params: {
  actorType: 'customer' | 'system' | 'admin';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getPool().query(
    `
    insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
    values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [params.actorType, params.actorId, params.action, params.entityType, params.entityId, params.reason ?? null, params.metadata ?? null]
  );
}

async function issueSession(params: {
  customerId: string;
  amr: string[];
  mfa: boolean;
  ip?: string;
  userAgent?: string;
  rotatedFrom?: string;
}): Promise<SessionIssue> {
  const sessionId = randomId('csn');
  const refreshToken = randomToken(48);
  const csrfToken = randomToken(18);
  const now = Math.floor(Date.now() / 1000);
  const env = envAuth();

  const accessToken = createHs256Jwt(
    {
      sub: params.customerId,
      iss: env.issuer,
      aud: env.audience,
      exp: now + accessTtlSeconds(),
      iat: now,
      tokenType: 'customer',
      sessionId,
      amr: params.amr,
      mfa: params.mfa
    },
    env.secret
  );

  const expiresAt = new Date((now + refreshTtlSeconds()) * 1000);
  await getPool().query(
    `
    insert into customer_session (
      session_id,
      customer_id,
      refresh_token_hash,
      csrf_token_hash,
      issued_at,
      expires_at,
      rotated_from,
      ip,
      user_agent
    )
    values ($1, $2, $3, $4, now(), $5, $6, $7, $8)
    `,
    [
      sessionId,
      params.customerId,
      sha256(refreshToken),
      sha256(csrfToken),
      expiresAt,
      params.rotatedFrom ?? null,
      params.ip ?? null,
      params.userAgent ?? null
    ]
  );

  return {
    sessionId,
    accessToken,
    refreshToken,
    csrfToken,
    expiresAt: expiresAt.toISOString()
  };
}

async function findCustomerByEmail(email: string): Promise<(CustomerRow & { identity: IdentityRow }) | null> {
  const result = await getPool().query(
    `
    select
      c.customer_id,
      c.full_name,
      c.country_code,
      c.status,
      i.id as identity_id,
      i.provider,
      i.provider_subject,
      i.email,
      i.phone_e164,
      i.password_hash,
      i.verified_at
    from customer_account c
    join customer_auth_identity i on i.customer_id = c.customer_id
    where lower(i.email) = lower($1)
    order by i.id asc
    limit 1
    `,
    [email]
  );
  const row = result.rows[0] as
    | {
        customer_id: string;
        full_name: string;
        country_code: string;
        status: CustomerRow['status'];
        identity_id: number;
        provider: IdentityRow['provider'];
        provider_subject: string | null;
        email: string | null;
        phone_e164: string | null;
        password_hash: string | null;
        verified_at: Date | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    customer_id: row.customer_id,
    full_name: row.full_name,
    country_code: row.country_code,
    status: row.status,
    identity: {
      id: row.identity_id,
      customer_id: row.customer_id,
      provider: row.provider,
      provider_subject: row.provider_subject,
      email: row.email,
      phone_e164: row.phone_e164,
      password_hash: row.password_hash,
      verified_at: row.verified_at
    }
  };
}

async function findCustomerByPhone(phoneE164: string): Promise<(CustomerRow & { identity: IdentityRow }) | null> {
  const result = await getPool().query(
    `
    select
      c.customer_id,
      c.full_name,
      c.country_code,
      c.status,
      i.id as identity_id,
      i.provider,
      i.provider_subject,
      i.email,
      i.phone_e164,
      i.password_hash,
      i.verified_at
    from customer_account c
    join customer_auth_identity i on i.customer_id = c.customer_id
    where i.phone_e164 = $1
    order by i.id asc
    limit 1
    `,
    [phoneE164]
  );
  const row = result.rows[0] as
    | {
        customer_id: string;
        full_name: string;
        country_code: string;
        status: CustomerRow['status'];
        identity_id: number;
        provider: IdentityRow['provider'];
        provider_subject: string | null;
        email: string | null;
        phone_e164: string | null;
        password_hash: string | null;
        verified_at: Date | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    customer_id: row.customer_id,
    full_name: row.full_name,
    country_code: row.country_code,
    status: row.status,
    identity: {
      id: row.identity_id,
      customer_id: row.customer_id,
      provider: row.provider,
      provider_subject: row.provider_subject,
      email: row.email,
      phone_e164: row.phone_e164,
      password_hash: row.password_hash,
      verified_at: row.verified_at
    }
  };
}

async function getMfaSecret(customerId: string, provider: KeyProvider): Promise<{ secretHex: string; enabled: boolean } | null> {
  const row = await getPool().query(
    `
    select secret_encrypted, enabled_at
    from customer_mfa_totp
    where customer_id = $1
    limit 1
    `,
    [customerId]
  );

  const value = row.rows[0] as
    | {
        secret_encrypted: unknown;
        enabled_at: Date | null;
      }
    | undefined;

  if (!value?.secret_encrypted) {
    return null;
  }

  const secretHex = await decryptField(value.secret_encrypted as EncryptedField, provider);
  return {
    secretHex,
    enabled: Boolean(value.enabled_at)
  };
}

async function resolveGoogleIdentity(code: string): Promise<{ subject: string; email: string }> {
  const mock = (process.env.GOOGLE_OAUTH_MOCK ?? 'true') !== 'false';
  if (!mock) {
    throw new Error('Real Google token exchange is not configured. Set GOOGLE_OAUTH_MOCK=true or implement provider adapter.');
  }

  const digest = sha256(code);
  return {
    subject: `google_${digest.slice(0, 20)}`,
    email: `google_${digest.slice(0, 12)}@mock.cryptopay.local`
  };
}

export async function buildCustomerAuthApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const metrics = createServiceMetrics('customer-auth');
  const provider = buildKeyProvider();

  app.addHook('onRequest', async (request, reply) => {
    request.headers['x-request-start'] = String(Date.now());

    if (request.url.startsWith('/internal/v1/')) {
      try {
        requireInternalService(request);
      } catch (error) {
        return deny({
          request,
          reply,
          code: 'FORBIDDEN',
          message: (error as Error).message,
          status: 403
        });
      }
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = Number(request.headers['x-request-start'] ?? Date.now());
    const duration = Math.max(Date.now() - started, 0);
    const route = request.routeOptions.url ?? request.url;
    const status = String(reply.statusCode);

    metrics.requestDurationMs.labels(request.method, route, status).observe(duration);
    metrics.requestCount.labels(request.method, route, status).inc();

    if (reply.statusCode >= 400) {
      metrics.errorCount.labels(status).inc();
    }
  });

  app.get('/healthz', async () => ({ ok: true, service: 'customer-auth' }));
  app.get('/readyz', async () => ({ ok: true }));
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.post('/internal/v1/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    if (parsed.data.password && !parsed.data.email) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: 'password requires email.',
        status: 400
      });
    }

    let idempotencyKey: string;
    try {
      idempotencyKey = parseIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }

    const response = await withIdempotency({
      scope: 'customer-auth:register',
      idempotencyKey,
      requestId: request.id,
      payload: parsed.data,
      execute: async () => {
        const email = parsed.data.email ? normalizeEmail(parsed.data.email) : null;
        const phone = parsed.data.phoneE164 ? normalizePhone(parsed.data.phoneE164) : null;

        if (email) {
          const existing = await findCustomerByEmail(email);
          if (existing) {
            return {
              status: 409,
              body: errorEnvelope(request, 'IDENTITY_ALREADY_EXISTS', 'Email already registered.')
            };
          }
        }

        if (phone) {
          const existing = await findCustomerByPhone(phone);
          if (existing) {
            return {
              status: 409,
              body: errorEnvelope(request, 'IDENTITY_ALREADY_EXISTS', 'Phone already registered.')
            };
          }
        }

        const customerId = randomId('cust');
        await getPool().query(
          `
          insert into customer_account (customer_id, full_name, country_code, status)
          values ($1, $2, $3, 'active')
          `,
          [customerId, parsed.data.fullName, parsed.data.countryCode.toUpperCase()]
        );

        await getPool().query(
          `
          insert into sender_kyc_profile (customer_id, provider, kyc_status)
          values ($1, 'sumsub', 'pending')
          on conflict (customer_id) do nothing
          `,
          [customerId]
        );

        if (email) {
          const passwordHash = parsed.data.password ? await hashPassword(parsed.data.password) : null;
          await getPool().query(
            `
            insert into customer_auth_identity (
              customer_id,
              provider,
              provider_subject,
              email,
              password_hash,
              verified_at
            )
            values ($1, $2, $3, $4, $5, $6)
            `,
            [
              customerId,
              parsed.data.password ? 'email_password' : 'email_magic',
              email,
              email,
              passwordHash,
              parsed.data.password ? new Date() : null
            ]
          );
        }

        if (phone) {
          await getPool().query(
            `
            insert into customer_auth_identity (
              customer_id,
              provider,
              provider_subject,
              phone_e164
            )
            values ($1, 'phone_otp', $2, $3)
            `,
            [customerId, phone, phone]
          );
        }

        const session = await issueSession({
          customerId,
          amr: parsed.data.password ? ['pwd', 'register'] : ['register'],
          mfa: false,
          ...sessionContext(request)
        });

        await appendAudit({
          actorType: 'customer',
          actorId: customerId,
          action: 'customer_registered',
          entityType: 'customer_account',
          entityId: customerId,
          metadata: {
            hasEmail: Boolean(email),
            hasPhone: Boolean(phone)
          }
        });

        return {
          status: 201,
          body: {
            customer: {
              customerId,
              fullName: parsed.data.fullName,
              countryCode: parsed.data.countryCode.toUpperCase()
            },
            session
          }
        };
      }
    });

    return reply.status(response.status).send(response.body);
  });

  app.post('/internal/v1/auth/login/password', async (request, reply) => {
    const parsed = passwordLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const record = await findCustomerByEmail(normalizeEmail(parsed.data.email));
    if (!record || record.identity.provider !== 'email_password' || !record.identity.password_hash) {
      return deny({
        request,
        reply,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        status: 401
      });
    }

    const verified = await verifyPassword(parsed.data.password, record.identity.password_hash);
    if (!verified) {
      return deny({
        request,
        reply,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
        status: 401
      });
    }

    const mfa = await getMfaSecret(record.customer_id, provider);
    if (mfa?.enabled) {
      if (!parsed.data.totpCode || !verifyTotpCode(mfa.secretHex, parsed.data.totpCode)) {
        return deny({
          request,
          reply,
          code: 'MFA_REQUIRED',
          message: 'Valid TOTP code required.',
          status: 401
        });
      }
    }

    const session = await issueSession({
      customerId: record.customer_id,
      amr: mfa?.enabled ? ['pwd', 'totp'] : ['pwd'],
      mfa: Boolean(mfa?.enabled),
      ...sessionContext(request)
    });

    await appendAudit({
      actorType: 'customer',
      actorId: record.customer_id,
      action: 'customer_login_password',
      entityType: 'customer_account',
      entityId: record.customer_id
    });

    return reply.send({
      customer: {
        customerId: record.customer_id,
        fullName: record.full_name,
        countryCode: record.country_code
      },
      session
    });
  });

  app.post('/internal/v1/auth/login/magic-link/request', async (request, reply) => {
    const parsed = emailMagicRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const token = randomToken(20);
    const challengeId = randomId('ach');
    const email = normalizeEmail(parsed.data.email);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await getPool().query(
      `
      insert into auth_challenge (challenge_id, type, target, token_hash, expires_at, metadata)
      values ($1, 'email_magic', $2, $3, $4, $5)
      `,
      [challengeId, email, sha256(token), expiresAt, JSON.stringify({ purpose: 'login' })]
    );

    await appendAudit({
      actorType: 'system',
      actorId: 'customer-auth',
      action: 'email_magic_link_requested',
      entityType: 'auth_challenge',
      entityId: challengeId
    });

    return reply.status(202).send({
      challengeId,
      expiresAt: expiresAt.toISOString(),
      ...(process.env.NODE_ENV === 'production' ? {} : { debugToken: token })
    });
  });

  app.post('/internal/v1/auth/login/magic-link/verify', async (request, reply) => {
    const parsed = emailMagicVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const query = await getPool().query(
      `
      select challenge_id, target, token_hash, expires_at, consumed_at, attempt_count
      from auth_challenge
      where challenge_id = $1 and type = 'email_magic'
      limit 1
      `,
      [parsed.data.challengeId]
    );

    const challenge = query.rows[0] as
      | {
          challenge_id: string;
          target: string;
          token_hash: string;
          expires_at: Date;
          consumed_at: Date | null;
          attempt_count: number;
        }
      | undefined;

    if (!challenge || challenge.consumed_at || challenge.expires_at.getTime() < Date.now()) {
      return deny({
        request,
        reply,
        code: 'CHALLENGE_INVALID',
        message: 'Magic-link challenge is invalid or expired.',
        status: 400
      });
    }

    if (sha256(parsed.data.token) !== challenge.token_hash) {
      await getPool().query('update auth_challenge set attempt_count = attempt_count + 1 where challenge_id = $1', [challenge.challenge_id]);
      return deny({
        request,
        reply,
        code: 'CHALLENGE_INVALID',
        message: 'Invalid magic-link token.',
        status: 400
      });
    }

    await getPool().query('update auth_challenge set consumed_at = now() where challenge_id = $1', [challenge.challenge_id]);

    let customer = await findCustomerByEmail(challenge.target);
    if (!customer) {
      const customerId = randomId('cust');
      await getPool().query(
        `insert into customer_account (customer_id, full_name, country_code, status) values ($1, $2, $3, 'active')`,
        [customerId, 'New Customer', 'ET']
      );
      await getPool().query(
        `insert into sender_kyc_profile (customer_id, provider, kyc_status) values ($1, 'sumsub', 'pending') on conflict (customer_id) do nothing`,
        [customerId]
      );
      await getPool().query(
        `
        insert into customer_auth_identity (customer_id, provider, provider_subject, email, verified_at)
        values ($1, 'email_magic', $2, $2, now())
        `,
        [customerId, challenge.target]
      );
      customer = await findCustomerByEmail(challenge.target);
    } else if (!customer.identity.verified_at) {
      await getPool().query('update customer_auth_identity set verified_at = now(), updated_at = now() where id = $1', [customer.identity.id]);
    }

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_RESOLUTION_FAILED',
        message: 'Unable to resolve customer account.',
        status: 500
      });
    }

    const mfa = await getMfaSecret(customer.customer_id, provider);
    if (mfa?.enabled) {
      if (!parsed.data.totpCode || !verifyTotpCode(mfa.secretHex, parsed.data.totpCode)) {
        return deny({
          request,
          reply,
          code: 'MFA_REQUIRED',
          message: 'Valid TOTP code required.',
          status: 401
        });
      }
    }

    const session = await issueSession({
      customerId: customer.customer_id,
      amr: mfa?.enabled ? ['email_magic', 'totp'] : ['email_magic'],
      mfa: Boolean(mfa?.enabled),
      ...sessionContext(request)
    });

    return reply.send({
      customer: {
        customerId: customer.customer_id,
        fullName: customer.full_name,
        countryCode: customer.country_code
      },
      session
    });
  });

  app.post('/internal/v1/auth/login/phone/request-otp', async (request, reply) => {
    const parsed = phoneOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challengeId = randomId('ach');
    const phone = normalizePhone(parsed.data.phoneE164);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await getPool().query(
      `
      insert into auth_challenge (challenge_id, type, target, code_hash, expires_at, metadata)
      values ($1, 'phone_otp', $2, $3, $4, $5)
      `,
      [challengeId, phone, sha256(code), expiresAt, JSON.stringify({ purpose: 'login' })]
    );

    await appendAudit({
      actorType: 'system',
      actorId: 'customer-auth',
      action: 'phone_otp_requested',
      entityType: 'auth_challenge',
      entityId: challengeId
    });

    return reply.status(202).send({
      challengeId,
      expiresAt: expiresAt.toISOString(),
      ...(process.env.NODE_ENV === 'production' ? {} : { debugCode: code })
    });
  });

  app.post('/internal/v1/auth/login/phone/verify-otp', async (request, reply) => {
    const parsed = phoneOtpVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const query = await getPool().query(
      `
      select challenge_id, target, code_hash, expires_at, consumed_at
      from auth_challenge
      where challenge_id = $1 and type = 'phone_otp'
      limit 1
      `,
      [parsed.data.challengeId]
    );
    const challenge = query.rows[0] as
      | {
          challenge_id: string;
          target: string;
          code_hash: string;
          expires_at: Date;
          consumed_at: Date | null;
        }
      | undefined;

    if (!challenge || challenge.consumed_at || challenge.expires_at.getTime() < Date.now()) {
      return deny({
        request,
        reply,
        code: 'CHALLENGE_INVALID',
        message: 'OTP challenge is invalid or expired.',
        status: 400
      });
    }

    if (sha256(parsed.data.code) !== challenge.code_hash) {
      await getPool().query('update auth_challenge set attempt_count = attempt_count + 1 where challenge_id = $1', [challenge.challenge_id]);
      return deny({
        request,
        reply,
        code: 'CHALLENGE_INVALID',
        message: 'Invalid OTP code.',
        status: 400
      });
    }

    await getPool().query('update auth_challenge set consumed_at = now() where challenge_id = $1', [challenge.challenge_id]);

    let customer = await findCustomerByPhone(challenge.target);
    if (!customer) {
      const customerId = randomId('cust');
      await getPool().query(
        `insert into customer_account (customer_id, full_name, country_code, status) values ($1, $2, $3, 'active')`,
        [customerId, 'New Customer', 'ET']
      );
      await getPool().query(
        `insert into sender_kyc_profile (customer_id, provider, kyc_status) values ($1, 'sumsub', 'pending') on conflict (customer_id) do nothing`,
        [customerId]
      );
      await getPool().query(
        `
        insert into customer_auth_identity (customer_id, provider, provider_subject, phone_e164, verified_at)
        values ($1, 'phone_otp', $2, $2, now())
        `,
        [customerId, challenge.target]
      );
      customer = await findCustomerByPhone(challenge.target);
    } else if (!customer.identity.verified_at) {
      await getPool().query('update customer_auth_identity set verified_at = now(), updated_at = now() where id = $1', [customer.identity.id]);
    }

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_RESOLUTION_FAILED',
        message: 'Unable to resolve customer account.',
        status: 500
      });
    }

    const mfa = await getMfaSecret(customer.customer_id, provider);
    if (mfa?.enabled) {
      if (!parsed.data.totpCode || !verifyTotpCode(mfa.secretHex, parsed.data.totpCode)) {
        return deny({
          request,
          reply,
          code: 'MFA_REQUIRED',
          message: 'Valid TOTP code required.',
          status: 401
        });
      }
    }

    const session = await issueSession({
      customerId: customer.customer_id,
      amr: mfa?.enabled ? ['phone_otp', 'totp'] : ['phone_otp'],
      mfa: Boolean(mfa?.enabled),
      ...sessionContext(request)
    });

    return reply.send({
      customer: {
        customerId: customer.customer_id,
        fullName: customer.full_name,
        countryCode: customer.country_code
      },
      session
    });
  });

  app.get('/internal/v1/auth/oauth/google/start', async (request, reply) => {
    const parsed = googleStartSchema.safeParse(request.query);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: parsed.error.issues[0]?.message ?? 'Invalid query.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const state = randomToken(24);
    const challengeId = randomId('ach');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await getPool().query(
      `
      insert into auth_challenge (challenge_id, type, target, token_hash, expires_at, metadata)
      values ($1, 'google_oauth_state', 'google', $2, $3, $4)
      `,
      [challengeId, sha256(state), expiresAt, JSON.stringify({ redirectUri: parsed.data.redirectUri ?? null })]
    );

    const callbackUrl = process.env.GOOGLE_OAUTH_REDIRECT_URL ?? 'http://localhost:3001/v1/auth/oauth/google/callback';
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? 'mock-google-client-id';
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);

    return reply.send({
      challengeId,
      state,
      authUrl: authUrl.toString()
    });
  });

  app.get('/internal/v1/auth/oauth/google/callback', async (request, reply) => {
    const parsed = googleCallbackSchema.safeParse(request.query);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: parsed.error.issues[0]?.message ?? 'Invalid query.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const stateHash = sha256(parsed.data.state);
    const query = await getPool().query(
      `
      select challenge_id, expires_at, consumed_at
      from auth_challenge
      where type = 'google_oauth_state'
        and token_hash = $1
      order by created_at desc
      limit 1
      `,
      [stateHash]
    );

    const challenge = query.rows[0] as
      | {
          challenge_id: string;
          expires_at: Date;
          consumed_at: Date | null;
        }
      | undefined;

    if (!challenge || challenge.consumed_at || challenge.expires_at.getTime() < Date.now()) {
      return deny({
        request,
        reply,
        code: 'STATE_INVALID',
        message: 'OAuth state is invalid or expired.',
        status: 400
      });
    }

    await getPool().query('update auth_challenge set consumed_at = now() where challenge_id = $1', [challenge.challenge_id]);

    const google = await resolveGoogleIdentity(parsed.data.code);
    const existing = await getPool().query(
      `
      select c.customer_id, c.full_name, c.country_code
      from customer_account c
      join customer_auth_identity i on i.customer_id = c.customer_id
      where (i.provider = 'google' and i.provider_subject = $1)
         or (lower(i.email) = lower($2))
      order by c.created_at asc
      limit 1
      `,
      [google.subject, google.email]
    );

    let customerId: string;
    let fullName: string;
    let countryCode: string;
    const row = existing.rows[0] as
      | {
          customer_id: string;
          full_name: string;
          country_code: string;
        }
      | undefined;

    if (row) {
      customerId = row.customer_id;
      fullName = row.full_name;
      countryCode = row.country_code;
      await getPool().query(
        `
        insert into customer_auth_identity (
          customer_id,
          provider,
          provider_subject,
          email,
          verified_at
        )
        values ($1, 'google', $2, $3, now())
        on conflict (provider, provider_subject)
        do update set email = excluded.email, verified_at = now(), updated_at = now()
        `,
        [customerId, google.subject, google.email]
      );
    } else {
      customerId = randomId('cust');
      fullName = 'Google User';
      countryCode = 'ET';
      await getPool().query(
        `
        insert into customer_account (customer_id, full_name, country_code, status)
        values ($1, $2, $3, 'active')
        `,
        [customerId, fullName, countryCode]
      );
      await getPool().query(
        `
        insert into customer_auth_identity (customer_id, provider, provider_subject, email, verified_at)
        values ($1, 'google', $2, $3, now())
        `,
        [customerId, google.subject, google.email]
      );
      await getPool().query(
        `insert into sender_kyc_profile (customer_id, provider, kyc_status) values ($1, 'sumsub', 'pending') on conflict (customer_id) do nothing`,
        [customerId]
      );
    }

    const session = await issueSession({
      customerId,
      amr: ['google'],
      mfa: false,
      ...sessionContext(request)
    });

    return reply.send({
      customer: {
        customerId,
        fullName,
        countryCode
      },
      session
    });
  });

  app.post('/internal/v1/auth/mfa/totp/setup', async (request, reply) => {
    let customerClaims: AuthClaims;
    try {
      customerClaims = requireCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const secretHex = randomBytes(20).toString('hex');
    const encrypted = await encryptField(secretHex, provider);
    await getPool().query(
      `
      insert into customer_mfa_totp (customer_id, secret_encrypted, enabled_at, disabled_at, updated_at)
      values ($1, $2, null, null, now())
      on conflict (customer_id)
      do update set secret_encrypted = excluded.secret_encrypted, enabled_at = null, disabled_at = null, updated_at = now()
      `,
      [customerClaims.sub, encrypted]
    );

    const issuer = encodeURIComponent(process.env.TOTP_ISSUER ?? 'CryptoPay');
    const label = encodeURIComponent(customerClaims.sub);
    const otpauthUri = `otpauth://totp/${issuer}:${label}?secret=${secretHex}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    return reply.send({
      secret: secretHex,
      otpauthUri
    });
  });

  app.post('/internal/v1/auth/mfa/totp/enable', async (request, reply) => {
    let customerClaims: AuthClaims;
    try {
      customerClaims = requireCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = totpEnableSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const record = await getMfaSecret(customerClaims.sub, provider);
    if (!record || !verifyTotpCode(record.secretHex, parsed.data.code)) {
      return deny({
        request,
        reply,
        code: 'MFA_CODE_INVALID',
        message: 'Invalid TOTP code.',
        status: 400
      });
    }

    await getPool().query('update customer_mfa_totp set enabled_at = now(), disabled_at = null, updated_at = now() where customer_id = $1', [
      customerClaims.sub
    ]);

    await appendAudit({
      actorType: 'customer',
      actorId: customerClaims.sub,
      action: 'mfa_totp_enabled',
      entityType: 'customer_account',
      entityId: customerClaims.sub
    });

    return reply.send({ ok: true });
  });

  app.post('/internal/v1/auth/mfa/totp/disable', async (request, reply) => {
    let customerClaims: AuthClaims;
    try {
      customerClaims = requireCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = totpEnableSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const record = await getMfaSecret(customerClaims.sub, provider);
    if (!record || !record.enabled || !verifyTotpCode(record.secretHex, parsed.data.code)) {
      return deny({
        request,
        reply,
        code: 'MFA_CODE_INVALID',
        message: 'Invalid TOTP code.',
        status: 400
      });
    }

    await getPool().query('update customer_mfa_totp set disabled_at = now(), enabled_at = null, updated_at = now() where customer_id = $1', [
      customerClaims.sub
    ]);

    await appendAudit({
      actorType: 'customer',
      actorId: customerClaims.sub,
      action: 'mfa_totp_disabled',
      entityType: 'customer_account',
      entityId: customerClaims.sub
    });

    return reply.send({ ok: true });
  });

  app.post('/internal/v1/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const refreshHash = sha256(parsed.data.refreshToken);
    const query = await getPool().query(
      `
      select session_id, customer_id, refresh_token_hash, csrf_token_hash, expires_at, revoked_at
      from customer_session
      where refresh_token_hash = $1
      limit 1
      `,
      [refreshHash]
    );
    const session = query.rows[0] as SessionRow | undefined;
    if (!session) {
      return deny({
        request,
        reply,
        code: 'SESSION_INVALID',
        message: 'Invalid refresh token.',
        status: 401
      });
    }

    if (session.revoked_at) {
      await getPool().query('update customer_session set revoked_at = now() where customer_id = $1 and revoked_at is null', [session.customer_id]);
      await appendAudit({
        actorType: 'system',
        actorId: 'customer-auth',
        action: 'refresh_token_reuse_detected',
        entityType: 'customer_account',
        entityId: session.customer_id
      });
      return deny({
        request,
        reply,
        code: 'SESSION_REVOKED',
        message: 'Refresh token was already used and session chain was revoked.',
        status: 401
      });
    }

    if (session.expires_at.getTime() < Date.now()) {
      await getPool().query('update customer_session set revoked_at = now() where session_id = $1', [session.session_id]);
      return deny({
        request,
        reply,
        code: 'SESSION_EXPIRED',
        message: 'Refresh token expired.',
        status: 401
      });
    }

    if (sha256(parsed.data.csrfToken) !== session.csrf_token_hash) {
      return deny({
        request,
        reply,
        code: 'CSRF_INVALID',
        message: 'Invalid CSRF token.',
        status: 401
      });
    }

    const mfa = await getMfaSecret(session.customer_id, provider);
    const nextSession = await issueSession({
      customerId: session.customer_id,
      amr: mfa?.enabled ? ['refresh', 'totp'] : ['refresh'],
      mfa: Boolean(mfa?.enabled),
      ...sessionContext(request),
      rotatedFrom: session.session_id
    });

    await getPool().query('update customer_session set revoked_at = now() where session_id = $1', [session.session_id]);

    return reply.send({
      session: nextSession
    });
  });

  app.post('/internal/v1/auth/logout', async (request, reply) => {
    let customerClaims: AuthClaims;
    try {
      customerClaims = requireCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    const parsed = logoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        details: parsed.error.issues,
        status: 400
      });
    }

    const sessionId = customerClaims.sessionId;
    if (sessionId) {
      await getPool().query('update customer_session set revoked_at = now() where session_id = $1 and revoked_at is null', [sessionId]);
    } else if (parsed.data.refreshToken) {
      await getPool().query('update customer_session set revoked_at = now() where refresh_token_hash = $1 and revoked_at is null', [
        sha256(parsed.data.refreshToken)
      ]);
    }

    await appendAudit({
      actorType: 'customer',
      actorId: customerClaims.sub,
      action: 'customer_logout',
      entityType: 'customer_account',
      entityId: customerClaims.sub
    });

    return reply.send({ ok: true });
  });

  app.post('/internal/v1/auth/logout-all', async (request, reply) => {
    let customerClaims: AuthClaims;
    try {
      customerClaims = requireCustomerClaims(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: (error as Error).message,
        status: 401
      });
    }

    await getPool().query('update customer_session set revoked_at = now() where customer_id = $1 and revoked_at is null', [customerClaims.sub]);

    await appendAudit({
      actorType: 'customer',
      actorId: customerClaims.sub,
      action: 'customer_logout_all',
      entityType: 'customer_account',
      entityId: customerClaims.sub
    });

    return reply.send({ ok: true });
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;

    log('error', 'customer-auth unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send(errorEnvelope(request, 'INTERNAL_ERROR', 'Unexpected internal error.'));
  });

  return app;
}
