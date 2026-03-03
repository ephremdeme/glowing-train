import type { AuthClaims } from '@cryptopay/auth';
import { deny } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../modules/audit/index.js';
import { RecipientsRepository } from '../modules/recipients/repository.js';

export function registerRecipientRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    recipientCreateSchema: { safeParse: (value: unknown) => { success: true; data: any } | { success: false; error: { issues: Array<{ message?: string }> } } };
    recipientUpdateSchema: { safeParse: (value: unknown) => { success: true; data: any } | { success: false; error: { issues: Array<{ message?: string }> } } };
    auditService: AuditService;
  }
): void {
  const { toCustomerClaims, recipientCreateSchema, recipientUpdateSchema, auditService } = deps;
  const repository = new RecipientsRepository();

  app.post('/v1/recipients', async (request, reply) => {
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

    const parsed = recipientCreateSchema.safeParse(request.body);
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

    const recipientId = `rcp_${randomBytes(10).toString('hex')}`;
    const recipient = await repository.create({
      recipientId,
      customerId: claims.sub,
      fullName: parsed.data.fullName,
      bankAccountName: parsed.data.bankAccountName,
      bankAccountNumber: parsed.data.bankAccountNumber,
      bankCode: parsed.data.bankCode,
      phoneE164: parsed.data.phoneE164 ?? null,
      countryCode: parsed.data.countryCode.toUpperCase()
    });

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_created',
      entityType: 'recipient',
      entityId: recipient.recipientId
    });

    return reply.status(201).send({
      recipientId: recipient.recipientId,
      fullName: recipient.fullName,
      bankAccountName: recipient.bankAccountName,
      bankAccountNumber: recipient.bankAccountNumber,
      bankCode: recipient.bankCode,
      phoneE164: recipient.phoneE164,
      countryCode: recipient.countryCode,
      status: recipient.status,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString()
    });
  });

  app.get('/v1/recipients', async (request, reply) => {
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

    const recipients = await repository.listByCustomer(claims.sub);

    return reply.send({
      recipients: recipients.map((row) => ({
        recipientId: row.recipientId,
        fullName: row.fullName,
        bankAccountName: row.bankAccountName,
        bankAccountNumber: row.bankAccountNumber,
        bankCode: row.bankCode,
        phoneE164: row.phoneE164,
        countryCode: row.countryCode,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      }))
    });
  });

  app.get('/v1/recipients/:recipientId', async (request, reply) => {
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

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const recipient = await repository.findByIdForCustomer({ recipientId, customerId: claims.sub });
    if (!recipient) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    return reply.send({
      recipientId: recipient.recipientId,
      fullName: recipient.fullName,
      bankAccountName: recipient.bankAccountName,
      bankAccountNumber: recipient.bankAccountNumber,
      bankCode: recipient.bankCode,
      phoneE164: recipient.phoneE164,
      countryCode: recipient.countryCode,
      status: recipient.status,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString()
    });
  });

  app.patch('/v1/recipients/:recipientId', async (request, reply) => {
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

    const parsed = recipientUpdateSchema.safeParse(request.body);
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

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const recipient = await repository.updateForCustomer({
      recipientId,
      customerId: claims.sub,
      fullName: parsed.data.fullName,
      bankAccountName: parsed.data.bankAccountName,
      bankAccountNumber: parsed.data.bankAccountNumber,
      bankCode: parsed.data.bankCode,
      phoneE164: parsed.data.phoneE164,
      countryCode: parsed.data.countryCode?.toUpperCase()
    });

    if (!recipient) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_updated',
      entityType: 'recipient',
      entityId: recipientId
    });

    return reply.send({
      recipientId: recipient.recipientId,
      fullName: recipient.fullName,
      bankAccountName: recipient.bankAccountName,
      bankAccountNumber: recipient.bankAccountNumber,
      bankCode: recipient.bankCode,
      phoneE164: recipient.phoneE164,
      countryCode: recipient.countryCode,
      status: recipient.status,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString()
    });
  });

  app.delete('/v1/recipients/:recipientId', async (request, reply) => {
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

    const recipientId = (request.params as { recipientId: string }).recipientId;
    const deleted = await repository.softDeleteForCustomer({
      recipientId,
      customerId: claims.sub
    });

    if (!deleted) {
      return deny({
        request,
        reply,
        code: 'RECIPIENT_NOT_FOUND',
        message: 'Recipient not found.',
        status: 404
      });
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'recipient_deleted',
      entityType: 'recipient',
      entityId: recipientId
    });

    return reply.status(204).send();
  });
}
