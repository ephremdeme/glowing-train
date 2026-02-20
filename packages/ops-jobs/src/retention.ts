import { query } from '@cryptopay/db';

export interface RetentionConfig {
  idempotencyDays: number;
  auditDays: number;
  reconciliationDays: number;
}

export interface RetentionResult {
  idempotencyDeleted: number;
  auditDeleted: number;
  reconciliationRunsDeleted: number;
  reconciliationIssuesDeleted: number;
}

function defaultConfig(): RetentionConfig {
  return {
    idempotencyDays: Number(process.env.RETENTION_IDEMPOTENCY_DAYS ?? 2),
    auditDays: Number(process.env.RETENTION_AUDIT_DAYS ?? 365),
    reconciliationDays: Number(process.env.RETENTION_RECONCILIATION_DAYS ?? 90)
  };
}

export async function runRetentionJob(config: RetentionConfig = defaultConfig()): Promise<RetentionResult> {
  const idempotencyDeleted = await query(
    `
    delete from idempotency_record
    where expires_at < now() - ($1 * interval '1 day')
    returning key
    `,
    [config.idempotencyDays]
  );

  const auditDeleted = await query(
    `
    delete from audit_log
    where created_at < now() - ($1 * interval '1 day')
    returning id
    `,
    [config.auditDays]
  );

  const reconciliationIssuesDeleted = await query(
    `
    delete from reconciliation_issue
    where detected_at < now() - ($1 * interval '1 day')
    returning id
    `,
    [config.reconciliationDays]
  );

  const reconciliationRunsDeleted = await query(
    `
    delete from reconciliation_run
    where started_at < now() - ($1 * interval '1 day')
    returning run_id
    `,
    [config.reconciliationDays]
  );

  return {
    idempotencyDeleted: idempotencyDeleted.rowCount ?? 0,
    auditDeleted: auditDeleted.rowCount ?? 0,
    reconciliationRunsDeleted: reconciliationRunsDeleted.rowCount ?? 0,
    reconciliationIssuesDeleted: reconciliationIssuesDeleted.rowCount ?? 0
  };
}
