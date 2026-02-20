import { assertHasRole, type AuthClaims, verifySignedPayloadSignature } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuditService } from '../modules/audit/index.js';
import { ReceiverKycService } from '../modules/receiver-kyc/index.js';

export function registerKycRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    toAuthClaims: (request: FastifyRequest) => AuthClaims;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    senderKycWebhookSchema: { safeParse: (value: unknown) => { success: true; data: any } | { success: false; error: { issues: Array<{ message?: string }> } } };
    receiverKycUpsertSchema: { safeParse: (value: unknown) => { success: true; data: any } | { success: false; error: { issues: Array<{ message?: string }> } } };
    auditService: AuditService;
    receiverKycService: ReceiverKycService;
  }
): void {
  const {
    toCustomerClaims,
    toAuthClaims,
    requiredIdempotencyKey,
    senderKycWebhookSchema,
    receiverKycUpsertSchema,
    auditService,
    receiverKycService
  } = deps;
app.get('/v1/kyc/sender/status', async (request, reply) => {
  let claims: AuthClaims;
  try {
    claims = toCustomerClaims(request);
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'UNAUTHORIZED',
      message: (error as Error).message,
      status: 401
    });
  }

  const result = await query(
    `
    select provider, applicant_id, kyc_status, reason_code, last_reviewed_at
    from sender_kyc_profile
    where customer_id = $1
    limit 1
    `,
    [claims.sub]
  );
  const row = result.rows[0] as
    | {
      provider: string;
      applicant_id: string | null;
      kyc_status: string;
      reason_code: string | null;
      last_reviewed_at: Date | null;
    }
    | undefined;

  return reply.send({
    customerId: claims.sub,
    provider: row?.provider ?? 'sumsub',
    applicantId: row?.applicant_id ?? null,
    kycStatus: row?.kyc_status ?? 'pending',
    reasonCode: row?.reason_code ?? null,
    lastReviewedAt: row?.last_reviewed_at?.toISOString() ?? null
  });
});

app.post('/v1/kyc/sender/sumsub-token', async (request, reply) => {
  let claims: AuthClaims;
  try {
    claims = toCustomerClaims(request);
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'UNAUTHORIZED',
      message: (error as Error).message,
      status: 401
    });
  }

  const applicantId = `sumsub_applicant_${claims.sub}`;
  await query(
    `
    insert into sender_kyc_profile (customer_id, provider, applicant_id, kyc_status, updated_at)
    values ($1, 'sumsub', $2, 'pending', now())
    on conflict (customer_id)
    do update set applicant_id = excluded.applicant_id, provider = excluded.provider, updated_at = now()
    `,
    [claims.sub, applicantId]
  );

  await auditService.append({
    actorType: 'customer',
    actorId: claims.sub,
    action: 'sender_kyc_session_requested',
    entityType: 'sender_kyc_profile',
    entityId: claims.sub
  });

  return reply.send({
    provider: 'sumsub',
    applicantId,
    token: `sumsub_mock_token_${claims.sub}_${Date.now()}`
  });
});

app.post('/internal/v1/kyc/sender/sumsub/webhook', async (request, reply) => {
  const payloadText = JSON.stringify(request.body ?? {});
  const timestampHeader = request.headers['x-callback-timestamp'];
  const signatureHeader = request.headers['x-callback-signature'];
  if (typeof timestampHeader !== 'string' || typeof signatureHeader !== 'string') {
    return deny({
      request,
      reply,
      code: 'INVALID_SIGNATURE_HEADERS',
      message: 'Missing signature headers.',
      status: 401
    });
  }

  const signatureOk = verifySignedPayloadSignature({
    payload: payloadText,
    timestampMs: timestampHeader,
    signatureHex: signatureHeader,
    secret: process.env.SUMSUB_WEBHOOK_SECRET ?? process.env.WATCHER_CALLBACK_SECRET ?? 'dev-callback-secret-change-me',
    maxAgeMs: Number(process.env.SUMSUB_WEBHOOK_MAX_AGE_MS ?? '300000')
  });
  if (!signatureOk) {
    return deny({
      request,
      reply,
      code: 'INVALID_SIGNATURE',
      message: 'Invalid webhook signature.',
      status: 401
    });
  }

  const parsed = senderKycWebhookSchema.safeParse(request.body);
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

  let idemKey: string;
  try {
    idemKey = requiredIdempotencyKey(request);
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
    db: { query },
    scope: 'core-api:sender-kyc:sumsub-webhook',
    idempotencyKey: idemKey,
    requestId: request.id,
    requestPayload: parsed.data,
    execute: async () => {
      await query(
        `
        insert into sender_kyc_profile (
          customer_id,
          provider,
          applicant_id,
          kyc_status,
          reason_code,
          last_reviewed_at,
          updated_at
        )
        values ($1, 'sumsub', $2, $3, $4, now(), now())
        on conflict (customer_id)
        do update set
          provider = excluded.provider,
          applicant_id = excluded.applicant_id,
          kyc_status = excluded.kyc_status,
          reason_code = excluded.reason_code,
          last_reviewed_at = now(),
          updated_at = now()
        `,
        [
          parsed.data.customerId,
          parsed.data.applicantId ?? null,
          parsed.data.reviewStatus,
          parsed.data.reasonCode ?? null
        ]
      );

      await auditService.append({
        actorType: 'system',
        actorId: 'sumsub-webhook',
        action: 'sender_kyc_status_updated',
        entityType: 'sender_kyc_profile',
        entityId: parsed.data.customerId,
        metadata: {
          kycStatus: parsed.data.reviewStatus,
          reasonCode: parsed.data.reasonCode ?? null
        }
      });

      return {
        status: 202,
        body: { ok: true }
      };
    }
  });

  return reply.status(response.status).send(response.body);
});
app.post('/internal/v1/kyc/receivers/upsert', async (request, reply) => {
  let claims: AuthClaims;
  try {
    claims = toAuthClaims(request);
    assertHasRole(claims, ['ops_admin', 'compliance_admin']);
  } catch (error) {
    await auditService.append({
      actorType: 'admin',
      actorId: 'unknown',
      action: 'receiver_kyc_upsert_denied',
      entityType: 'receiver_kyc_profile',
      entityId: 'unknown',
      reason: (error as Error).message
    });
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const parsed = receiverKycUpsertSchema.safeParse(request.body);
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

  const upsertInput = {
    receiverId: parsed.data.receiverId,
    kycStatus: parsed.data.kycStatus,
    nationalIdVerified: parsed.data.nationalIdVerified,
    ...(parsed.data.nationalId ? { nationalIdPlaintext: parsed.data.nationalId } : {})
  };

  const profile = await receiverKycService.upsert(upsertInput);

  await auditService.append({
    actorType: 'admin',
    actorId: claims.sub,
    action: 'receiver_kyc_upsert',
    entityType: 'receiver_kyc_profile',
    entityId: profile.receiverId,
    reason: parsed.data.reason,
    metadata: {
      kycStatus: profile.kycStatus,
      nationalIdVerified: profile.nationalIdVerified
    }
  });

  return reply.status(200).send({
    receiverId: profile.receiverId,
    kycStatus: profile.kycStatus,
    nationalIdVerified: profile.nationalIdVerified,
    updatedAt: profile.updatedAt.toISOString()
  });
});

app.get('/internal/v1/kyc/receivers/:receiverId', async (request, reply) => {
  try {
    const claims = toAuthClaims(request);
    assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
  } catch (error) {
    return deny({
      request,
      reply,
      code: 'FORBIDDEN',
      message: (error as Error).message,
      status: 403
    });
  }

  const receiverId = (request.params as { receiverId: string }).receiverId;
  const profile = await receiverKycService.getByReceiverId(receiverId);
  if (!profile) {
    return deny({
      request,
      reply,
      code: 'RECEIVER_KYC_NOT_FOUND',
      message: `Receiver KYC profile ${receiverId} not found.`,
      status: 404
    });
  }

  return reply.send({
    receiverId: profile.receiverId,
    kycStatus: profile.kycStatus,
    nationalIdVerified: profile.nationalIdVerified,
    nationalIdHash: profile.nationalIdHash,
    updatedAt: profile.updatedAt.toISOString()
  });
});
}
