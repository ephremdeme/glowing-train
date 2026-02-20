import type { AuthClaims } from '@cryptopay/auth';
import { query } from '@cryptopay/db';
import { deny } from '@cryptopay/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuditService } from '../modules/audit/index.js';

export function registerCustomerProfileRoutes(
  app: FastifyInstance,
  deps: {
    toCustomerClaims: (request: FastifyRequest) => AuthClaims;
    meUpdateSchema: any;
    auditService: AuditService;
  }
): void {
  const { toCustomerClaims, meUpdateSchema, auditService } = deps;

  app.get('/v1/me', async (request, reply) => {
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

    const customerResult = await query(
      `
      select customer_id, full_name, country_code, status
      from customer_account
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const customer = customerResult.rows[0] as
      | {
          customer_id: string;
          full_name: string;
          country_code: string;
          status: string;
        }
      | undefined;

    if (!customer) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer profile not found.',
        status: 404
      });
    }

    const senderKyc = await query(
      `
      select kyc_status, applicant_id, reason_code, last_reviewed_at
      from sender_kyc_profile
      where customer_id = $1
      limit 1
      `,
      [claims.sub]
    );
    const kycRow = senderKyc.rows[0] as
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
        kycStatus: kycRow?.kyc_status ?? 'pending',
        applicantId: kycRow?.applicant_id ?? null,
        reasonCode: kycRow?.reason_code ?? null,
        lastReviewedAt: kycRow?.last_reviewed_at?.toISOString() ?? null
      }
    });
  });

  app.patch('/v1/me', async (request, reply) => {
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

    const parsed = meUpdateSchema.safeParse(request.body);
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

    const updated = await query(
      `
      update customer_account
      set
        full_name = coalesce($2, full_name),
        country_code = coalesce($3, country_code),
        updated_at = now()
      where customer_id = $1
      returning customer_id, full_name, country_code, status, updated_at
      `,
      [claims.sub, parsed.data.fullName ?? null, parsed.data.countryCode?.toUpperCase() ?? null]
    );
    const row = updated.rows[0] as
      | {
          customer_id: string;
          full_name: string;
          country_code: string;
          status: string;
          updated_at: Date;
        }
      | undefined;

    if (!row) {
      return deny({
        request,
        reply,
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer profile not found.',
        status: 404
      });
    }

    await auditService.append({
      actorType: 'customer',
      actorId: claims.sub,
      action: 'customer_profile_updated',
      entityType: 'customer_account',
      entityId: claims.sub
    });

    return reply.send({
      customerId: row.customer_id,
      fullName: row.full_name,
      countryCode: row.country_code,
      status: row.status,
      updatedAt: row.updated_at.toISOString()
    });
  });
}
