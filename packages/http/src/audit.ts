export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export async function appendAuditLog(params: {
  db: Queryable;
  actorType: 'customer' | 'system' | 'admin';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await params.db.query(
    `
    insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
    values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      params.actorType,
      params.actorId,
      params.action,
      params.entityType,
      params.entityId,
      params.reason ?? null,
      params.metadata ?? null
    ]
  );
}
