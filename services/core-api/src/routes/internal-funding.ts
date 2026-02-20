import { assertTokenType, type AuthClaims, verifySignedPayloadSignature } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { FundingConfirmationService } from '../modules/funding-confirmations/index.js';

export function registerInternalFundingRoutes(
  app: FastifyInstance,
  deps: {
    toAuthClaims: (request: FastifyRequest) => AuthClaims;
    fundingCallbackSchema: { safeParse: (value: unknown) => { success: true; data: any } | { success: false; error: { issues: Array<{ message?: string }> } } };
    fundingService: FundingConfirmationService;
  }
): void {
  const { toAuthClaims, fundingCallbackSchema, fundingService } = deps;
app.post('/internal/v1/funding-confirmed', async (request, reply) => {
  let claims: AuthClaims;

  try {
    claims = toAuthClaims(request);
    assertTokenType(claims, ['service', 'admin']);
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'UNAUTHORIZED',
      message: (error as Error).message,
      status: 401
    });
  }

  const timestampMs = request.headers['x-callback-timestamp'];
  const signature = request.headers['x-callback-signature'];
  if (typeof timestampMs !== 'string' || typeof signature !== 'string') {
    return deny({
      request,
      reply,
      code: 'INVALID_SIGNATURE_HEADERS',
      message: 'Missing callback signature headers.',
      status: 401
    });
  }

  const callbackSecret = process.env.WATCHER_CALLBACK_SECRET ?? 'dev-callback-secret-change-me';
  const payloadText = JSON.stringify(request.body ?? {});
  const validSignature = verifySignedPayloadSignature({
    payload: payloadText,
    timestampMs,
    signatureHex: signature,
    secret: callbackSecret,
    maxAgeMs: Number(process.env.WATCHER_CALLBACK_MAX_AGE_MS ?? 300000)
  });

  if (!validSignature) {
    return deny({
      request,
      reply,
      code: 'INVALID_CALLBACK_SIGNATURE',
      message: 'Callback signature verification failed.',
      status: 401
    });
  }

  const parsed = fundingCallbackSchema.safeParse(request.body);
  if (!parsed.success) {
    return deny({
      request,
      reply,
      code: 'INVALID_FUNDING_EVENT',
      message: parsed.error.issues[0]?.message ?? 'Invalid payload.',
      status: 400,
      details: parsed.error.issues
    });
  }

  const idempotencyKey =
    (typeof request.headers['idempotency-key'] === 'string' && request.headers['idempotency-key']) || parsed.data.eventId;

  const response = await withIdempotency({
    db: { query },
    scope: 'core-api:funding-confirmed',
    idempotencyKey,
    requestId: request.id,
    requestPayload: parsed.data,
    execute: async () => {
      const result = await fundingService.processFundingConfirmed({
        ...parsed.data,
        confirmedAt: new Date(parsed.data.confirmedAt)
      });

      return {
        status: result.status === 'confirmed' ? 202 : 200,
        body: {
          result,
          acceptedBy: claims.sub
        }
      };
    }
  });

  return reply.status(response.status).send(response.body);
});
}
