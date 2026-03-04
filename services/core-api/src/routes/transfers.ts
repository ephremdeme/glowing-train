import type { AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny, withIdempotency } from '@cryptopay/http';
import { createServiceLogger } from '@cryptopay/observability';
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


type CollectorVerifyBasePaymentPayload = {
  verified: true;
  transferId: string;
  chain: 'base';
  token: 'USDC' | 'USDT';
  txHash: string;
  amountUsd: number;
  depositAddress: string;
  confirmedAt: string;
  referenceHash?: string;
  payerAddress?: string;
  paymentId?: string;
};

const PENDING_BASE_VERIFY_ERROR_CODES = new Set(['TX_NOT_FOUND', 'BASE_RPC_READ_FAILED']);

function isCollectorVerifyBasePaymentPayload(value: unknown): value is CollectorVerifyBasePaymentPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CollectorVerifyBasePaymentPayload>;
  return Boolean(
    payload.verified === true &&
      payload.chain === 'base' &&
      typeof payload.transferId === 'string' &&
      typeof payload.token === 'string' &&
      (payload.token === 'USDC' || payload.token === 'USDT') &&
      typeof payload.txHash === 'string' &&
      typeof payload.depositAddress === 'string' &&
      typeof payload.confirmedAt === 'string' &&
      typeof payload.amountUsd === 'number'
  );
}

type SupportedPaymentChain = 'solana' | 'base';
type PaymentSubmissionSource = 'manual_copy_address' | 'wallet_pay';
type CollectorVerifyPaymentPayload = CollectorVerifySolanaPaymentPayload | CollectorVerifyBasePaymentPayload;

const logger = createServiceLogger({ service: 'core-api' });

const COLLECTOR_MANUAL_ERROR_MESSAGES: Record<string, string> = {
  TX_NOT_FOUND: 'Transaction not found yet on-chain. Wait a moment and retry verification.',
  TX_FAILED: 'Transaction failed on-chain and cannot fund this transfer.',
  INVALID_TRANSFER_CHAIN: 'Transaction was submitted to a mismatched chain endpoint.',
  DEPOSIT_ADDRESS_MISMATCH: 'Transaction does not fund this transfer address.',
  MINT_MISMATCH: 'Transaction token does not match this transfer token.',
  TREASURY_ATA_MISMATCH: 'Transaction destination account does not match this transfer route.',
  AMOUNT_MISMATCH: 'Transaction amount does not match the expected transfer funding amount.'
};

function parseCollectorVerifyPaymentPayload(
  chain: SupportedPaymentChain,
  value: unknown
): CollectorVerifyPaymentPayload | null {
  if (chain === 'solana') {
    return isCollectorVerifySolanaPaymentPayload(value) ? value : null;
  }

  return isCollectorVerifyBasePaymentPayload(value) ? value : null;
}

function resolveSubmissionSource(value: unknown): PaymentSubmissionSource {
  return value === 'wallet_pay' ? 'wallet_pay' : 'manual_copy_address';
}

export function registerTransferRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    transferListQuerySchema: any;
    transferCreateSchema: any;
    transferSolanaPaymentSchema: any;
    transferBasePaymentSchema: any;
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
    transferBasePaymentSchema,
    buildInternalServiceToken,
    fundingService
  } = deps;
  const repository = new TransferRepository();

  const toFundingMode = (chain: string, routeKind: string | null): 'copy_address_auto' | 'program_pay_legacy' => {
    if (chain === 'solana' && routeKind === 'solana_program_pay') {
      return 'program_pay_legacy';
    }
    return 'copy_address_auto';
  };

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

    const [transitions, funding, payout, latestFundingSubmission] = await Promise.all([
      repository.listTransitions(transferId),
      repository.findFunding(transferId),
      repository.findPayout(transferId),
      repository.findLatestFundingSubmissionAttempt(transferId)
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
        depositMemo: transfer.depositMemo,
        routeKind: transfer.routeKind ?? 'address_route',
        fundingMode: toFundingMode(transfer.chain, transfer.routeKind ?? null)
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
            confirmedAt: funding.confirmedAt.toISOString(),
            amountDecision: funding.amountDecision
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
      pendingFundingSubmission: latestFundingSubmission?.status === 'submitted'
        ? {
            txHash: latestFundingSubmission.txHash,
            submittedAt: latestFundingSubmission.submittedAt.toISOString()
          }
        : null,
      latestFundingSubmission: latestFundingSubmission
        ? {
            txHash: latestFundingSubmission.txHash,
            chain: latestFundingSubmission.chain,
            status: latestFundingSubmission.status,
            source: latestFundingSubmission.source,
            submittedAt: latestFundingSubmission.submittedAt.toISOString(),
            updatedAt: latestFundingSubmission.updatedAt.toISOString()
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

  const acceptedSubmissionStates = new Set(['AWAITING_FUNDING', 'FUNDING_CONFIRMED', 'PAYOUT_INITIATED', 'PAYOUT_COMPLETED']);

  const registerChainPaymentRoute = (params: {
    chain: SupportedPaymentChain;
    paymentSchema: any;
    pendingVerifyErrorCodes: Set<string>;
    collectorScope: string;
    collectorVerifyPath: string;
    collectorIdempotencyPrefix: string;
    idempotencyScope: string;
    verificationSource: string;
  }) => {
    app.post(`/v1/transfers/:transferId/${params.chain}-payment`, async (request, reply) => {
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
      const parsed = params.paymentSchema.safeParse(request.body);
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
      const submissionSource = resolveSubmissionSource(parsed.data.submissionSource);

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
      if (transfer.chain !== params.chain) {
        return deny({
          request,
          reply,
          code: 'INVALID_TRANSFER_CHAIN',
          message: `This endpoint only supports ${params.chain === 'base' ? 'Base' : 'Solana'} transfers.`,
          status: 400
        });
      }
      if (!acceptedSubmissionStates.has(transfer.status)) {
        return deny({
          request,
          reply,
          code: 'INVALID_TRANSFER_STATE',
          message: `Transfer is not in a state that accepts ${params.chain === 'base' ? 'Base' : 'Solana'} payment confirmation.`,
          status: 409
        });
      }

      const response = await withIdempotency({
        db: { query },
        scope: params.idempotencyScope,
        idempotencyKey: key,
        requestId: request.id,
        requestPayload: {
          transferId,
          txHash: parsed.data.txHash,
          customerId: claims.sub,
          submissionSource
        },
        execute: async () => {
          if (transfer.status === 'AWAITING_FUNDING') {
            await repository.recordFundingSubmissionAttempt({
              transferId,
              chain: params.chain,
              txHash: parsed.data.txHash,
              metadata: {
                source: submissionSource
              }
            });
          }

          const collectorToken = buildInternalServiceToken(params.collectorScope);
          const collectorResponse = await fetch(
            `${process.env.OFFSHORE_COLLECTOR_URL ?? 'http://localhost:3002'}${params.collectorVerifyPath}`,
            {
              method: 'POST',
              headers: {
                authorization: `Bearer ${collectorToken}`,
                'content-type': 'application/json',
                'idempotency-key': `${params.collectorIdempotencyPrefix}:${key}`
              },
              body: JSON.stringify({
                transferId,
                txHash: parsed.data.txHash
              })
            }
          );

          const collectorPayload = (await collectorResponse.json().catch(() => ({}))) as unknown;
          const verifiedCollectorPayload = parseCollectorVerifyPaymentPayload(params.chain, collectorPayload);
          if (!collectorResponse.ok || !verifiedCollectorPayload) {
            const errorPayload = collectorPayload as CollectorErrorPayload;
            const collectorCode = errorPayload?.error?.code ?? null;

            if (
              transfer.status === 'AWAITING_FUNDING' &&
              collectorResponse.status === 409 &&
              collectorCode &&
              params.pendingVerifyErrorCodes.has(collectorCode)
            ) {
              logger.info('transfer.payment.pending_verification', {
                transferId,
                chain: params.chain,
                txHash: parsed.data.txHash,
                submissionSource,
                collectorStatus: collectorResponse.status,
                collectorCode
              });
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
                  source: submissionSource,
                  collectorStatus: collectorResponse.status,
                  collectorCode
                }
              });
            }

            if (collectorCode && COLLECTOR_MANUAL_ERROR_MESSAGES[collectorCode] && errorPayload.error) {
              errorPayload.error.message = COLLECTOR_MANUAL_ERROR_MESSAGES[collectorCode];
            }

            logger.warn('transfer.payment.verification_failed', {
              transferId,
              chain: params.chain,
              txHash: parsed.data.txHash,
              submissionSource,
              collectorStatus: collectorResponse.status,
              collectorCode
            });

            return {
              status: collectorResponse.status,
              body: collectorPayload
            };
          }

          const confirmedAt = new Date(verifiedCollectorPayload.confirmedAt);
          if (Number.isNaN(confirmedAt.getTime())) {
            if (transfer.status === 'AWAITING_FUNDING') {
              await repository.markFundingSubmissionAttemptFailed({
                transferId,
                txHash: parsed.data.txHash,
                metadata: {
                  source: submissionSource,
                  collectorStatus: collectorResponse.status,
                  collectorCode: 'INVALID_CONFIRMED_AT'
                }
              });
            }

            return {
              status: 502,
              body: {
                error: {
                  code: 'COLLECTOR_INVALID_RESPONSE',
                  message: 'Collector returned an invalid confirmation timestamp.'
                }
              }
            };
          }

          const fundingResult = await fundingService.processFundingConfirmed({
            eventId: `${params.chain}:${verifiedCollectorPayload.transferId}:${verifiedCollectorPayload.txHash}`,
            chain: params.chain,
            token: verifiedCollectorPayload.token,
            txHash: verifiedCollectorPayload.txHash,
            logIndex: 0,
            transferId: verifiedCollectorPayload.transferId,
            depositAddress: verifiedCollectorPayload.depositAddress,
            amountUsd: verifiedCollectorPayload.amountUsd,
            confirmedAt,
            metadata: {
              payerAddress: verifiedCollectorPayload.payerAddress ?? null,
              paymentId: verifiedCollectorPayload.paymentId ?? null,
              referenceHash: verifiedCollectorPayload.referenceHash ?? null,
              verificationSource: params.verificationSource,
              submissionSource
            }
          });

          const latest = await repository.findDetailForSender({ transferId, senderId: claims.sub });
          const backendStatus = latest?.status ?? transfer.status;

          if (fundingResult.status === 'amount_underpaid') {
            return {
              status: 409,
              body: {
                error: {
                  code: 'AMOUNT_UNDERPAID',
                  message: 'Payment was detected but the funded amount is lower than the transfer amount.'
                },
                transferId,
                txHash: verifiedCollectorPayload.txHash,
                backendStatus
              }
            };
          }

          if (fundingResult.status === 'amount_over_limit') {
            return {
              status: 409,
              body: {
                error: {
                  code: 'AMOUNT_OVER_LIMIT',
                  message: 'Payment was detected but exceeds the automatic funding limit for this transfer.'
                },
                transferId,
                txHash: verifiedCollectorPayload.txHash,
                backendStatus
              }
            };
          }

          const resultLabel =
            fundingResult.status === 'confirmed'
              ? 'confirmed'
              : fundingResult.status === 'duplicate' || fundingResult.status === 'invalid_state'
                ? 'duplicate'
                : 'pending_verification';

          logger.info('transfer.payment.verification_result', {
            transferId,
            chain: params.chain,
            txHash: verifiedCollectorPayload.txHash,
            depositAddress: verifiedCollectorPayload.depositAddress,
            submissionSource,
            fundingResult: fundingResult.status,
            amountDecision: fundingResult.amountDecision ?? null,
            backendStatus
          });

          const code = fundingResult.amountDecision === 'overpay_adjusted' ? 'FUNDING_AMOUNT_ADJUSTED' : undefined;

          return {
            status: fundingResult.status === 'confirmed' ? 202 : 200,
            body: {
              result: resultLabel,
              transferId,
              txHash: verifiedCollectorPayload.txHash,
              ...(code ? { code } : {}),
              backendStatus
            }
          };
        }
      });

      return reply.status(response.status).send(response.body);
    });
  };

  registerChainPaymentRoute({
    chain: 'solana',
    paymentSchema: transferSolanaPaymentSchema,
    pendingVerifyErrorCodes: PENDING_SOLANA_VERIFY_ERROR_CODES,
    collectorScope: 'collector:solana-payments:verify',
    collectorVerifyPath: '/internal/v1/transfers/solana-payment/verify',
    collectorIdempotencyPrefix: 'core-solana-verify',
    idempotencyScope: 'core-api:transfers:solana-payment',
    verificationSource: 'solana_wallet_pay_client_submit'
  });

  registerChainPaymentRoute({
    chain: 'base',
    paymentSchema: transferBasePaymentSchema,
    pendingVerifyErrorCodes: PENDING_BASE_VERIFY_ERROR_CODES,
    collectorScope: 'collector:base-payments:verify',
    collectorVerifyPath: '/internal/v1/transfers/base-payment/verify',
    collectorIdempotencyPrefix: 'core-base-verify',
    idempotencyScope: 'core-api:transfers:base-payment',
    verificationSource: 'base_wallet_pay_client_submit'
  });
}
