import { getPool } from '@cryptopay/db';

type Pool = ReturnType<typeof getPool>;

type AuditMetadata = Record<string, unknown>;

function sanitizeMetadata(metadata: AuditMetadata): AuditMetadata {
  const sanitized: AuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (/secret|token|privatekey|password/i.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export class AuditService {
  constructor(private readonly pool: Pool = getPool()) {}

  async append(input: {
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    reason?: string;
    metadata?: AuditMetadata;
  }): Promise<void> {
    await this.pool.query(
      `
      insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
      values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.actorType,
        input.actorId,
        input.action,
        input.entityType,
        input.entityId,
        input.reason ?? null,
        input.metadata ? sanitizeMetadata(input.metadata) : null
      ]
    );
  }

  async findByEntity(entityType: string, entityId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(
      'select actor_type, actor_id, action, entity_type, entity_id, reason, metadata from audit_log where entity_type = $1 and entity_id = $2 order by id asc',
      [entityType, entityId]
    );

    return result.rows as Array<Record<string, unknown>>;
  }
}
