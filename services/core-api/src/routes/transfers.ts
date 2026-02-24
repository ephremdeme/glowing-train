import type { AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FundingConfirmationService } from '../modules/funding-confirmations/index.js';
import { TransferRepository } from '../modules/transfers/repository.js';

type CollectorVerifySolanaPaymentPayload = {
  verified: true;
  transferId: string;
  chain: 'solana';
  token: 'USDC' | 'USDT';
  txHash: string;
  amountUsd: number;
  depositAddress: string;
  confirmedAt: string;
  referenceHash?: string;
  payerAddress?: string;
  paymentId?: string;
};

type CollectorErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

const PENDING_SOLANA_VERIFY_ERROR_CODES = new Set(['TX_NOT_FOUND', 'SOLANA_RPC_READ_FAILED']);

function isCollectorVerifySolanaPaymentPayload(value: unknown): value is CollectorVerifySolanaPaymentPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CollectorVerifySolanaPaymentPayload>;
  return Boolean(
    payload.verified === true &&
      payload.chain === 'solana' &&
      typeof payload.transferId === 'string' &&
      typeof payload.token === 'string' &&
      (payload.token === 'USDC' || payload.token === 'USDT') &&
      typeof payload.txHash === 'string' &&
      typeof payload.depositAddress === 'string' &&
      typeof payload.confirmedAt === 'string' &&
      typeof payload.amountUsd === 'number'
  );
}

export function registerTransferRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    transferListQuerySchema: any;
    transferCreateSchema: any;
    transferSolanaPaymentSchema: any;
    buildInternalServiceToken: (scope: string) => string;
    fundingService: FundingConfirmationService;
  }
): void {
  const {
    toCustomerClaims,
    requiredIdempotencyKey,
    transferListQuerySchema,
    transferCreateSchema,
    transferSolanaPaymentSchema,
    buildInternalServiceToken,
    fundingService
  } = deps;
  const repository = new TransferRepository();

  app.get('/v1/transfers', async (request, reply) => {
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

    const parsed = transferListQuerySchema.safeParse(request.query ?? {});
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

    const limit = parsed.data.limit ?? 20;
    const status = parsed.data.status;

    const rows = await repository.listForSender({
      senderId: claims.sub,
      status: status as any,
      limit
    });

    return reply.send({
      items: rows.map((row) => ({
        transferId: row.transferId,
        quoteId: row.quoteId,
        recipientId: row.recipientId,
        recipientName: row.recipientName,
        chain: row.chain,
        token: row.token,
        sendAmountUsd: Number(row.sendAmountUsd),
        status: row.status,
        depositAddress: row.depositAddress,
        createdAt: row.createdAt.toISOString()
      })),
      count: rows.length
    });
  });

  app.get('/v1/transfers/:transferId', async (request, reply) => {
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

    const transferId = (request.params as { transferId: string }).transferId;
    const transfer = await repository.findDetailForSender({
      transferId,
      senderId: claims.sub
    });

    if (!transfer) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found.',
        status: 404
      });
    }

    const [transitions, funding, payout, pendingFundingSubmission] = await Promise.all([
      repository.listTransitions(transferId),
      repository.findFunding(transferId),
      repository.findPayout(transferId),
      repository.findLatestPendingFundingSubmission(transferId)
    ]);

    return reply.send({
      transfer: {
        transferId: transfer.transferId,
        quoteId: transfer.quoteId,
        senderId: transfer.senderId,
        recipientId: transfer.recipientId,
        chain: transfer.chain,
        token: transfer.token,
        sendAmountUsd: Number(transfer.sendAmountUsd),
        status: transfer.status,
        createdAt: transfer.createdAt.toISOString(),
        depositAddress: transfer.depositAddress,
        depositMemo: transfer.depositMemo
      },
      quote: {
        quoteId: transfer.quoteId,
        fxRateUsdToEtb: Number(transfer.fxRateUsdToEtb),
        feeUsd: Number(transfer.feeUsd),
        recipientAmountEtb: Number(transfer.recipientAmountEtb),
        expiresAt: transfer.expiresAt.toISOString()
      },
      recipient: {
        recipientId: transfer.recipientId,
        fullName: transfer.recipientName,
        bankAccountName: transfer.bankAccountName,
        bankAccountNumber: transfer.bankAccountNumber,
        bankCode: transfer.bankCode,
        phoneE164: transfer.phoneE164
      },
      funding: funding
        ? {
            eventId: funding.eventId,
            txHash: funding.txHash,
            amountUsd: Number(funding.amountUsd),
            confirmedAt: funding.confirmedAt.toISOString()
          }
        : null,
      payout: payout
        ? {
            payoutId: payout.payoutId,
            method: payout.method,
            amountEtb: Number(payout.amountEtb),
            status: payout.status,
            providerReference: payout.providerReference,
            updatedAt: payout.updatedAt.toISOString()
          }
        : null,
      pendingFundingSubmission: pendingFundingSubmission
        ? {
            txHash: pendingFundingSubmission.txHash,
            submittedAt: pendingFundingSubmission.submittedAt.toISOString()
          }
        : null,
      transitions: transitions.map((row) => ({
        fromState: row.fromState,
        toState: row.toState,
        occurredAt: row.occurredAt.toISOString()
      }))
    });
  });

  app.post('/v1/transfers', async (request, reply) => {
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

    const parsed = transferCreateSchema.safeParse(request.body);
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

    let key: string;
    try {
      key = requiredIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }

    const senderKycStatus = await repository.findSenderKycStatus(claims.sub);
    if (!senderKycStatus || senderKycStatus !== 'approved') {
      return deny({
        request,
        reply,
        code: 'SENDER_KYC_REQUIRED',
        message: 'Sender KYC must be approved before first transfer.',
        status: 403
      });
    }

    const recipientExists = await repository.hasActiveRecipient({
      recipientId: parsed.data.recipientId,
      customerId: claims.sub
    });
    if (!recipientExists) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    const collectorToken = buildInternalServiceToken('collector:transfers:create');
    const collectorPayload = {
      quoteId: parsed.data.quoteId,
      senderId: claims.sub,
      receiverId: parsed.data.recipientId,
      senderKycStatus,
      idempotencyKey: key
    };

    const collectorResponse = await fetch(`${process.env.OFFSHORE_COLLECTOR_URL ?? 'http://localhost:3002'}/internal/v1/transfers/create`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${collectorToken}`,
        'content-type': 'application/json',
        'idempotency-key': key
      },
      body: JSON.stringify(collectorPayload)
    });
    const payload = await collectorResponse.json().catch(() => ({}));
    return reply.status(collectorResponse.status).send(payload);
  });

  app.post('/v1/transfers/:transferId/solana-payment', async (request, reply) => {
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

    const transferId = (request.params as { transferId: string }).transferId;
    const parsed = transferSolanaPaymentSchema.safeParse(request.body);
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

    let key: string;
    try {
      key = requiredIdempotencyKey(request);
    } catch (error) {
      return deny({
        request,
        reply,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: (error as Error).message,
        status: 400
      });
    }

    const transfer = await repository.findDetailForSender({ transferId, senderId: claims.sub });
    if (!transfer) {
      return deny({
        request,
        reply,
        code: 'TRANSFER_NOT_FOUND',
        message: 'Transfer not found.',
        status: 404
      });
    }
    if (transfer.chain !== 'solana') {
      return deny({
        request,
        reply,
        code: 'INVALID_TRANSFER_CHAIN',
        message: 'This endpoint only supports Solana transfers.',
        status: 400
      });
    }
    if (transfer.status !== 'AWAITING_FUNDING' && transfer.status !== 'FUNDING_CONFIRMED' && transfer.status !== 'PAYOUT_INITIATED' && transfer.status !== 'PAYOUT_COMPLETED') {
      return deny({
        request,
        reply,
        code: 'INVALID_TRANSFER_STATE',
        message: 'Transfer is not in a state that accepts Solana payment confirmation.',
        status: 409
      });
    }

    const response = await withIdempotency({
      db: { query },
      scope: 'core-api:transfers:solana-payment',
      idempotencyKey: key,
      requestId: request.id,
      requestPayload: { transferId, txHash: parsed.data.txHash, customerId: claims.sub },
      execute: async () => {
        if (transfer.status === 'AWAITING_FUNDING') {
          await repository.recordFundingSubmissionAttempt({
            transferId,
            chain: 'solana',
            txHash: parsed.data.txHash,
            metadata: {
              source: 'customer_submit'
            }
          });
        }

        const collectorToken = buildInternalServiceToken('collector:solana-payments:verify');
        const collectorResponse = await fetch(
          `${process.env.OFFSHORE_COLLECTOR_URL ?? 'http://localhost:3002'}/internal/v1/transfers/solana-payment/verify`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${collectorToken}`,
              'content-type': 'application/json',
              'idempotency-key': `core-solana-verify:${key}`
            },
            body: JSON.stringify({
              transferId,
              txHash: parsed.data.txHash
            })
          }
        );

        const collectorPayload = (await collectorResponse.json().catch(() => ({}))) as unknown;

        if (!collectorResponse.ok || !isCollectorVerifySolanaPaymentPayload(collectorPayload)) {
          const errorPayload = collectorPayload as CollectorErrorPayload;
          const collectorCode = errorPayload?.error?.code ?? null;

          if (
            transfer.status === 'AWAITING_FUNDING' &&
            collectorResponse.status === 409 &&
            collectorCode &&
            PENDING_SOLANA_VERIFY_ERROR_CODES.has(collectorCode)
          ) {
            return {
              status: 202,
              body: {
                result: 'pending_verification',
                transferId,
                txHash: parsed.data.txHash,
                backendStatus: transfer.status
              }
            };
          }

          if (transfer.status === 'AWAITING_FUNDING') {
            await repository.markFundingSubmissionAttemptFailed({
              transferId,
              txHash: parsed.data.txHash,
              metadata: {
                source: 'customer_submit',
                collectorStatus: collectorResponse.status,
                collectorCode
              }
            });
          }

          return {
            status: collectorResponse.status,
            body: collectorPayload
          };
        }

        const fundingResult = await fundingService.processFundingConfirmed({
          eventId: `solana:${collectorPayload.transferId}:${collectorPayload.txHash}`,
          chain: 'solana',
          token: collectorPayload.token,
          txHash: collectorPayload.txHash,
          logIndex: 0,
          transferId: collectorPayload.transferId,
          depositAddress: collectorPayload.depositAddress,
          amountUsd: collectorPayload.amountUsd,
          confirmedAt: new Date(collectorPayload.confirmedAt),
          metadata: {
            payerAddress: collectorPayload.payerAddress ?? null,
            paymentId: collectorPayload.paymentId ?? null,
            referenceHash: collectorPayload.referenceHash ?? null,
            verificationSource: 'solana_wallet_pay_client_submit'
          }
        });

        const latest = await repository.findDetailForSender({ transferId, senderId: claims.sub });
        const backendStatus = latest?.status ?? transfer.status;
        const resultLabel =
          fundingResult.status === 'confirmed'
            ? 'confirmed'
            : fundingResult.status === 'duplicate' || fundingResult.status === 'invalid_state'
              ? 'duplicate'
              : 'pending_verification';

        return {
          status: fundingResult.status === 'confirmed' ? 202 : 200,
          body: {
            result: resultLabel,
            transferId,
            txHash: collectorPayload.txHash,
            backendStatus
          }
        };
      }
    });

    return reply.status(response.status).send(response.body);
  });
}
