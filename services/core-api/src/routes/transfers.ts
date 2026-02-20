import type { AuthClaims } from '@cryptopay/auth';
import { deny } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { TransferRepository } from '../modules/transfers/repository.js';

export function registerTransferRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    requiredIdempotencyKey: (request: FastifyRequest) => string;
    transferListQuerySchema: any;
    transferCreateSchema: any;
    buildInternalServiceToken: (scope: string) => string;
  }
): void {
  const { toCustomerClaims, requiredIdempotencyKey, transferListQuerySchema, transferCreateSchema, buildInternalServiceToken } = deps;
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

    const [transitions, funding, payout] = await Promise.all([
      repository.listTransitions(transferId),
      repository.findFunding(transferId),
      repository.findPayout(transferId)
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

    const receiverKyc = await repository.findReceiverKyc(parsed.data.recipientId);

    const collectorToken = buildInternalServiceToken('collector:transfers:create');
    const collectorPayload = {
      quoteId: parsed.data.quoteId,
      senderId: claims.sub,
      receiverId: parsed.data.recipientId,
      senderKycStatus,
      receiverKycStatus: receiverKyc?.kycStatus ?? 'pending',
      receiverNationalIdVerified: receiverKyc?.nationalIdVerified ?? false,
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
}
