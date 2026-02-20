import { query, type QueryResult } from '@cryptopay/db';
import { appendAuditLog } from '@cryptopay/http';

export async function appendCustomerAuthAudit(params: {
  actorType: 'customer' | 'system';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const payload: {
    db: {
      query: (sql: string, params?: unknown[]) => Promise<QueryResult<Record<string, unknown>>>;
    };
    actorType: 'customer' | 'system';
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  } = {
    db: { query },
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId
  };

  if (params.reason !== undefined) {
    payload.reason = params.reason;
  }

  if (params.metadata !== undefined) {
    payload.metadata = params.metadata;
  }

  await appendAuditLog({
    ...payload
  });
}
