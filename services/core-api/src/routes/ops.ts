import { assertHasRole, type AuthClaims } from '@cryptopay/auth';
import { deny } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuditService } from '../modules/audit/index.js';
import { OpsRepository } from '../modules/ops/repository.js';

function toLegacyTransferRecord(item: {
  transferId: string;
  quoteId: string;
  senderId: string;
  receiverId: string;
  chain: string;
  token: string;
  sendAmountUsd: string;
  status: string;
  createdAt: Date;
}) {
  return {
    transfer_id: item.transferId,
    quote_id: item.quoteId,
    sender_id: item.senderId,
    receiver_id: item.receiverId,
    chain: item.chain,
    token: item.token,
    send_amount_usd: item.sendAmountUsd,
    status: item.status,
    created_at: item.createdAt
  };
}

export function registerOpsRoutes(
  app: FastifyInstance,
  deps: {
    toAuthClaims: (request: FastifyRequest) => AuthClaims;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    forwardToReconciliationWorker: (params: {
      path: string;
      method: 'GET' | 'POST';
      body?: unknown;
      actor: string;
      command: string;
      idempotencyKey?: string;
    }) => Promise<Response>;
    reconciliationRunSchema: any;
    retryPayoutSchema: any;
    markReviewedSchema: any;
    auditService: AuditService;
  }
): void {
  const {
    toAuthClaims,
    requiredIdempotencyKey,
    forwardToReconciliationWorker,
    reconciliationRunSchema,
    retryPayoutSchema,
    markReviewedSchema,
    auditService
  } = deps;
  const repository = new OpsRepository();

  app.get('/internal/v1/ops/transfers', async (request, reply) => {
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

    const queryParams = request.query as { status?: string; limit?: string };
    const rawLimit = Number(queryParams.limit ?? '50');
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    const rows = await repository.listTransfers(
      queryParams.status
        ? {
            status: queryParams.status as any,
            limit
          }
        : {
            limit
          }
    );

    return reply.send({
      items: rows.map(toLegacyTransferRecord),
      count: rows.length
    });
  });

  app.get('/internal/v1/ops/transfers/:transferId', async (request, reply) => {
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

    const { transferId } = request.params as { transferId: string };

    const transfer = await repository.findTransferById(transferId);
    if (!transfer) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: `Transfer ${transferId} not found.`,
        status: 404
      });
    }

    const [transitions, payout, funding] = await Promise.all([
      repository.listTransitionsByTransferId(transferId),
      repository.findPayoutByTransferId(transferId),
      repository.findFundingByTransferId(transferId)
    ]);

    return reply.send({
      transfer: {
        transfer_id: transfer.transferId,
        quote_id: transfer.quoteId,
        sender_id: transfer.senderId,
        receiver_id: transfer.receiverId,
        sender_kyc_status: transfer.senderKycStatus,
        receiver_kyc_status: transfer.receiverKycStatus,
        receiver_national_id_verified: transfer.receiverNationalIdVerified,
        chain: transfer.chain,
        token: transfer.token,
        send_amount_usd: transfer.sendAmountUsd,
        status: transfer.status,
        created_at: transfer.createdAt,
        updated_at: transfer.updatedAt
      },
      transitions: transitions.map((transition) => ({
        from_state: transition.fromState,
        to_state: transition.toState,
        metadata: transition.metadata,
        occurred_at: transition.occurredAt
      })),
      payout: payout
        ? {
            payout_id: payout.payoutId,
            transfer_id: payout.transferId,
            method: payout.method,
            recipient_account_ref: payout.recipientAccountRef,
            amount_etb: payout.amountEtb,
            status: payout.status,
            provider_reference: payout.providerReference,
            attempt_count: payout.attemptCount,
            last_error: payout.lastError,
            created_at: payout.createdAt,
            updated_at: payout.updatedAt
          }
        : null,
      funding: funding
        ? {
            event_id: funding.eventId,
            chain: funding.chain,
            token: funding.token,
            tx_hash: funding.txHash,
            log_index: funding.logIndex,
            transfer_id: funding.transferId,
            deposit_address: funding.depositAddress,
            amount_usd: funding.amountUsd,
            confirmed_at: funding.confirmedAt,
            created_at: funding.createdAt
          }
        : null
    });
  });

  app.get('/internal/v1/ops/sla/breaches', async (request, reply) => {
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

    const thresholdMinutes = Number(process.env.PAYOUT_SLA_MINUTES ?? '10');
    const breaches = await repository.listSlaBreaches(thresholdMinutes);

    return reply.send({
      thresholdMinutes,
      breaches: breaches.map((row) => ({
        transfer_id: row.transferId,
        confirmed_at: row.confirmedAt,
        payout_initiated_at: row.payoutInitiatedAt,
        minutes_to_payout: row.minutesToPayout
      }))
    });
  });

  app.get('/internal/v1/ops/reconciliation/runs/:runId', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_run_read_denied',
        entityType: 'reconciliation_run',
        entityId: (request.params as { runId?: string }).runId ?? 'unknown',
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

    const runId = (request.params as { runId: string }).runId;
    const response = await forwardToReconciliationWorker({
      path: `/internal/v1/ops/reconciliation/runs/${runId}`,
      method: 'GET',
      actor: claims.sub,
      command: 'reconciliation run get'
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.get('/internal/v1/ops/reconciliation/issues', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_viewer', 'ops_admin', 'compliance_viewer', 'compliance_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_issues_read_denied',
        entityType: 'reconciliation_issue',
        entityId: 'list',
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

    const queryParams = request.query as { since?: string; limit?: string };
    const queryString = new URLSearchParams();
    if (queryParams.since) {
      queryString.set('since', queryParams.since);
    }
    if (queryParams.limit) {
      queryString.set('limit', queryParams.limit);
    }

    const response = await forwardToReconciliationWorker({
      path: `/internal/v1/ops/reconciliation/issues${queryString.toString().length > 0 ? `?${queryString.toString()}` : ''}`,
      method: 'GET',
      actor: claims.sub,
      command: 'reconciliation issues list'
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/reconciliation/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      await auditService.append({
        actorType: 'admin',
        actorId: 'unknown',
        action: 'ops_reconciliation_run_denied',
        entityType: 'reconciliation_run',
        entityId: 'trigger',
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

    const parsed = reconciliationRunSchema.safeParse(request.body);
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

    const idempotencyKey = requiredIdempotencyKey(request);
    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/reconciliation/run',
      method: 'POST',
      actor: claims.sub,
      command: typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'reconciliation run',
      idempotencyKey,
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/jobs/retention/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = reconciliationRunSchema.pick({ reason: true }).safeParse(request.body);
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

    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/jobs/retention/run',
      method: 'POST',
      actor: claims.sub,
      command: 'retention run',
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/jobs/key-verification/run', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const parsed = reconciliationRunSchema.pick({ reason: true }).safeParse(request.body);
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

    const response = await forwardToReconciliationWorker({
      path: '/internal/v1/ops/jobs/key-verification/run',
      method: 'POST',
      actor: claims.sub,
      command: 'key verification run',
      body: parsed.data
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid reconciliation-worker response.' } }))) as unknown;
    return reply.status(response.status).send(payload);
  });

  app.post('/internal/v1/ops/payouts/:transferId/retry', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const bodyParse = retryPayoutSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: bodyParse.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: bodyParse.error.issues
      });
    }

    const transferId = (request.params as { transferId: string }).transferId;
    const payoutInstruction = await repository.findPayoutByTransferId(transferId);

    if (!payoutInstruction) {
      return deny({
        request,
        reply,
        code: 'PAYOUT_NOT_FOUND',
        message: `No payout instruction for transfer ${transferId}.`,
        status: 404
      });
    }

    const commandText = typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'payout retry';
    const actorHeader = typeof request.headers['x-ops-actor'] === 'string' ? request.headers['x-ops-actor'] : claims.sub;

    await auditService.append({
      actorType: 'admin',
      actorId: claims.sub,
      action: 'ops_payout_retry_requested',
      entityType: 'transfer',
      entityId: transferId,
      reason: bodyParse.data.reason,
      metadata: {
        actor: actorHeader,
        command: commandText,
        method: payoutInstruction.method
      }
    });

    const retryKey = `ops-retry:${transferId}:${Date.now()}`;
    const orchestratorUrl = process.env.PAYOUT_ORCHESTRATOR_URL ?? 'http://localhost:3003';
    const response = await fetch(`${orchestratorUrl}/internal/v1/payouts/initiate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: request.headers.authorization ?? '',
        'idempotency-key': retryKey,
        'x-ops-command': commandText,
        'x-ops-actor': actorHeader
      },
      body: JSON.stringify({
        transferId,
        method: payoutInstruction.method,
        recipientAccountRef: payoutInstruction.recipientAccountRef,
        amountEtb: Number(payoutInstruction.amountEtb),
        idempotencyKey: retryKey
      })
    });

    const responseBody = (await response.json().catch(() => ({ error: { message: 'Invalid orchestrator response.' } }))) as unknown;
    return reply.status(response.status).send(responseBody);
  });

  app.post('/internal/v1/ops/transfers/:transferId/mark-reviewed', async (request, reply) => {
    let claims: AuthClaims;
    try {
      claims = toAuthClaims(request);
      assertHasRole(claims, ['ops_admin']);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'FORBIDDEN',
        message: (error as Error).message,
        status: 403
      });
    }

    const bodyParse = markReviewedSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return deny({
        request,
        reply,
        code: 'INVALID_PAYLOAD',
        message: bodyParse.error.issues[0]?.message ?? 'Invalid payload.',
        status: 400,
        details: bodyParse.error.issues
      });
    }

    const transferId = (request.params as { transferId: string }).transferId;
    const transfer = await repository.findTransferById(transferId);

    if (!transfer) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: `Transfer ${transferId} not found.`,
        status: 404
      });
    }

    await repository.insertManualReviewTransition({
      transferId,
      fromState: transfer.status,
      actorId: claims.sub
    });

    const commandText = typeof request.headers['x-ops-command'] === 'string' ? request.headers['x-ops-command'] : 'transfer mark-reviewed';
    const actorHeader = typeof request.headers['x-ops-actor'] === 'string' ? request.headers['x-ops-actor'] : claims.sub;

    await auditService.append({
      actorType: 'admin',
      actorId: claims.sub,
      action: 'ops_transfer_mark_reviewed',
      entityType: 'transfer',
      entityId: transferId,
      reason: bodyParse.data.reason,
      metadata: {
        actor: actorHeader,
        command: commandText
      }
    });

    return reply.send({
      transferId,
      status: transfer.status,
      reviewedBy: claims.sub
    });
  });
}
