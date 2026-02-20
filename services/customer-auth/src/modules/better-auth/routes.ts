import { deny, withIdempotency } from '@cryptopay/http';
import { query } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import type { FastifyInstance } from 'fastify';
import { appendCustomerAuthAudit } from '../audit/service.js';
import { issueCustomerExchangeToken } from '../token-exchange/service.js';
import { defaultGoogleRedirectUri, normalizeEmail, schemas } from './config.js';
import {
  applySetCookies,
  authBaseUrl,
  cookieHeaderFromSetCookies,
  customerByCustomerId,
  customerByUserId,
  customerClaims,
  ensureCustomerLink,
  invokeBetterAuth,
  payloadMessage,
  requestHeaders,
  resolveAmr,
  resolveSession,
  responsePayload,
  getSetCookies,
  withReplyFromResponse
} from './internals.js';
import type { CustomerRow } from './internals.js';

export function registerBetterAuthRoutes(app: FastifyInstance): void {
  app.post('/auth/sign-up/email', async (request, reply) => {
    const parsed = schemas.signUpSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: { query },
      scope: 'customer-auth:signup:email',
      idempotencyKey,
      requestId: request.id,
      requestPayload: parsed.data,
      execute: async () => {
        const authResponse = await invokeBetterAuth({
          path: '/sign-up/email',
          method: 'POST',
          headers: requestHeaders(request),
          body: {
            name: parsed.data.fullName,
            email: normalizeEmail(parsed.data.email),
            password: parsed.data.password
          }
        });

        const authPayload = await responsePayload(authResponse);
        setCookies = getSetCookies(authResponse);
        if (!authResponse.ok) {
          return {
            status: authResponse.status,
            body: authPayload ?? {
              error: {
                code: 'SIGN_UP_FAILED',
                message: 'Could not create account.'
              }
            }
          };
        }

        const cookie = cookieHeaderFromSetCookies(setCookies);
        const session = await resolveSession(cookie.length > 0 ? cookie : null);
        if (!session) {
          return {
            status: 500,
            body: {
              error: {
                code: 'SESSION_CREATE_FAILED',
                message: 'Account created but session could not be resolved.'
              }
            }
          };
        }

        const customer = await ensureCustomerLink({
          userId: session.userId,
          email: parsed.data.email,
          fullName: parsed.data.fullName,
          countryCode: parsed.data.countryCode
        });

        await appendCustomerAuthAudit({
          actorType: 'customer',
          actorId: customer.customer_id,
          action: 'customer_registered',
          entityType: 'customer_account',
          entityId: customer.customer_id,
          metadata: { provider: 'credential' }
        });

        return {
          status: 201,
          body: {
            customer: {
              customerId: customer.customer_id,
              fullName: customer.full_name,
              countryCode: customer.country_code
            },
            session: {
              sessionId: session.sessionId,
              expiresAt: session.expiresAt
            }
          }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.post('/auth/sign-in/email', async (request, reply) => {
    const parsed = schemas.signInSchema.safeParse(request.body);
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const authResponse = await invokeBetterAuth({
      path: '/sign-in/email',
      method: 'POST',
      headers: requestHeaders(request),
      body: {
        email: normalizeEmail(parsed.data.email),
        password: parsed.data.password
      }
    });

    const authPayload = await responsePayload(authResponse);
    if (!authResponse.ok) {
      return deny({
        request,
        reply,
        code: 'INVALID_CREDENTIALS',
        message: payloadMessage(authPayload, 'Invalid email or password.'),
        status: authResponse.status
      });
    }

    const setCookies = getSetCookies(authResponse);
    const cookie = cookieHeaderFromSetCookies(setCookies);
    const session = await resolveSession(cookie.length > 0 ? cookie : null);
    if (!session) {
      return deny({
        request,
        reply,
        code: 'SESSION_INVALID',
        message: 'Session was not created.',
        status: 500
      });
    }

    const customer = await ensureCustomerLink({
      userId: session.userId,
      email: session.email || parsed.data.email,
      fullName: session.name || session.email || parsed.data.email,
      countryCode: 'ET'
    });

    await appendCustomerAuthAudit({
      actorType: 'customer',
      actorId: customer.customer_id,
      action: 'customer_login_password',
      entityType: 'customer_account',
      entityId: customer.customer_id
    });

    applySetCookies(reply, setCookies);
    return reply.send({
      customer: {
        customerId: customer.customer_id,
        fullName: customer.full_name,
        countryCode: customer.country_code
      },
      session: {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
      }
    });
  });

  app.get('/auth/sign-in/google', async (request, reply) => {
    const parsed = schemas.googleStartSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_QUERY',
        message: parsed.error.issues[0]?.message ?? 'Invalid query.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const authResponse = await invokeBetterAuth({
      path: '/sign-in/social',
      method: 'POST',
      headers: requestHeaders(request),
      body: {
        provider: 'google',
        callbackURL: parsed.data.redirectUri ?? defaultGoogleRedirectUri(),
        disableRedirect: true
      }
    });

    const authPayload = await responsePayload(authResponse);
    const authUrl =
      authPayload && typeof authPayload === 'object' && 'url' in authPayload
        ? String((authPayload as { url?: string }).url ?? '')
        : '';

    if (!authResponse.ok || authUrl.length === 0) {
      return deny({
        request,
        reply,
        code: 'GOOGLE_AUTH_START_FAILED',
        message: payloadMessage(authPayload, 'Could not start Google sign-in.'),
        status: authResponse.status
      });
    }

    return reply.send({ authUrl });
  });

  app.post('/auth/session/exchange', async (request, reply) => {
    const parsed = schemas.tokenExchangeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: parsed.error.issues
      });
    }

    const session = await resolveSession(undefined, requestHeaders(request));
    if (!session) {
      return deny({
        request,
        reply,
        code: 'SESSION_REQUIRED',
        message: 'Active auth session is required.',
        status: 401
      });
    }

    if (parsed.data.sessionId && parsed.data.sessionId !== session.sessionId) {
      return deny({
        request,
        reply,
        code: 'SESSION_INVALID',
        message: 'Session is invalid or expired.',
        status: 401
      });
    }

    const customer = await ensureCustomerLink({
      userId: session.userId,
      email: session.email || `${session.userId}@unknown.local`,
      fullName: session.name || session.email || 'Customer',
      countryCode: 'ET'
    });

    const amr = await resolveAmr(session.userId);
    const issued = issueCustomerExchangeToken({
      customerId: customer.customer_id,
      sessionId: session.sessionId,
      amr
    });

    await appendCustomerAuthAudit({
      actorType: 'customer',
      actorId: customer.customer_id,
      action: 'customer_session_exchanged',
      entityType: 'session',
      entityId: session.sessionId
    });

    return reply.send({
      token: issued.token,
      expiresAt: issued.expiresAt,
      customerId: customer.customer_id,
      sessionId: session.sessionId
    });
  });

  app.post('/auth/sign-out', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const currentSession = await resolveSession(undefined, requestHeaders(request));
    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: { query },
      scope: 'customer-auth:signout',
      idempotencyKey,
      requestId: request.id,
      requestPayload: { sessionId: currentSession?.sessionId ?? null },
      execute: async () => {
        const authResponse = await invokeBetterAuth({
          path: '/sign-out',
          method: 'POST',
          headers: requestHeaders(request)
        });
        const authPayload = await responsePayload(authResponse);
        setCookies = getSetCookies(authResponse);

        if (!authResponse.ok) {
          return {
            status: authResponse.status,
            body: authPayload ?? { ok: false }
          };
        }

        if (currentSession) {
          const customer = await customerByUserId(currentSession.userId);
          if (customer) {
            await appendCustomerAuthAudit({
              actorType: 'customer',
              actorId: customer.customer_id,
              action: 'customer_logout',
              entityType: 'session',
              entityId: currentSession.sessionId
            });
          }
        }

        return {
          status: 200,
          body: { ok: true }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.post('/auth/sign-out/all', async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Missing idempotency-key header.',
        status: 400
      });
    }

    const currentSession = await resolveSession(undefined, requestHeaders(request));
    if (!currentSession) {
      return deny({
        request,
        reply,
        code: 'SESSION_REQUIRED',
        message: 'Active auth session is required.',
        status: 401
      });
    }

    let setCookies: string[] = [];

    const response = await withIdempotency({
      db: { query },
      scope: 'customer-auth:signout-all',
      idempotencyKey,
      requestId: request.id,
      requestPayload: { userId: currentSession.userId },
      execute: async () => {
        await query('delete from session where user_id = $1', [currentSession.userId]);
        const authResponse = await invokeBetterAuth({
          path: '/sign-out',
          method: 'POST',
          headers: requestHeaders(request)
        });
        setCookies = getSetCookies(authResponse);

        const customer = await customerByUserId(currentSession.userId);
        if (customer) {
          await appendCustomerAuthAudit({
            actorType: 'customer',
            actorId: customer.customer_id,
            action: 'customer_logout_all',
            entityType: 'customer_account',
            entityId: customer.customer_id
          });
        }

        return {
          status: 200,
          body: { ok: true }
        };
      }
    });

    applySetCookies(reply, setCookies);
    return reply.status(response.status).send(response.body);
  });

  app.get('/auth/me', async (request, reply) => {
    let customer: CustomerRow | null = null;

    try {
      const claims = customerClaims(request);
      customer = await customerByCustomerId(claims.sub);
    } catch {
      const session = await resolveSession(undefined, requestHeaders(request));
      if (session) {
        customer = await customerByUserId(session.userId);
        if (!customer) {
          customer = await ensureCustomerLink({
            userId: session.userId,
            email: session.email || `${session.userId}@unknown.local`,
            fullName: session.name || session.email || 'Customer',
            countryCode: 'ET'
          });
        }
      }
    }

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
        status: 401
      });
    }

    const senderKyc = await query(
      `
      select kyc_status, applicant_id, reason_code, last_reviewed_at
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [customer.customer_id]
    );

    const kyc = senderKyc.rows[0] as
      | {
          kyc_status: string;
          applicant_id: string | null;
          reason_code: string | null;
          last_reviewed_at: Date | null;
        }
      | undefined;

    return reply.send({
      customerId: customer.customer_id,
      fullName: customer.full_name,
      countryCode: customer.country_code,
      status: customer.status,
      senderKyc: {
        kycStatus: kyc?.kyc_status ?? 'pending',
        applicantId: kyc?.applicant_id ?? null,
        reasonCode: kyc?.reason_code ?? null,
        lastReviewedAt: kyc?.last_reviewed_at?.toISOString() ?? null
      }
    });
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, authBaseUrl());
      const path = `${url.pathname.replace(/^\/auth/, '')}${url.search}`;
      const method = request.method === 'POST' ? 'POST' : 'GET';
      const response = await invokeBetterAuth({
        path,
        method,
        headers: requestHeaders(request),
        body: method === 'POST' ? request.body : undefined
      });

      const payload = await responsePayload(response);
      return withReplyFromResponse(reply, response, payload);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error;
    log('error', 'customer-auth unhandled error', {
      message: err.message,
      stack: err.stack,
      requestId: request.id
    });

    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error.',
        requestId: request.id
      }
    });
  });
}
