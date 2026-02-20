import { closeDb, query } from '@cryptopay/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../src/modules/audit/index.js';

async function ensureAuditTable(): Promise<void> {
  await query(`
    create table if not exists audit_log (
      id bigserial primary key,
      actor_type text not null,
      actor_id text not null,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      reason text,
      metadata jsonb,
      created_at timestamptz not null default now()
    )
  `);
}

describe('audit integration', () => {
  let audit: AuditService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_REGION = 'ethiopia';
    process.env.DATABASE_URL = 'postgres://cryptopay:cryptopay@localhost:55432/cryptopay';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ETHIOPIA_SERVICES_CRYPTO_DISABLED = 'true';

    await ensureAuditTable();
    audit = new AuditService();
  });

  beforeEach(async () => {
    await query('truncate table audit_log restart identity');
  });

  afterAll(async () => {
    await closeDb();
  });

  it('appends audit entries and redacts sensitive metadata keys', async () => {
    await audit.append({
      actorType: 'admin',
      actorId: 'ops_1',
      action: 'manual_payout_override',
      entityType: 'transfer',
      entityId: 'tr_audit_1',
      reason: 'Manual review resolution',
      metadata: {
        note: 'case resolved',
        apiToken: 'sensitive',
        privateKey: 'sensitive'
      }
    });

    const rows = await audit.findByEntity('transfer', 'tr_audit_1');
    expect(rows).toHaveLength(1);

    const firstRow = rows[0];
    if (!firstRow) {
      throw new Error('Expected one audit row.');
    }

    const metadata = firstRow.metadata as Record<string, unknown>;
    expect(metadata.note).toBe('case resolved');
    expect(metadata.apiToken).toBe('[REDACTED]');
    expect(metadata.privateKey).toBe('[REDACTED]');
  });
});
