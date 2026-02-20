/**
 * Session Cleanup Job
 *
 * Purges expired and revoked customer sessions from the database.
 * Runs periodically to keep the session table lean and accelerate
 * session-exchange lookups.
 */

import { getPool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

export interface SessionCleanupConfig {
  /** Additional grace period (minutes) beyond expiry before deletion (default: 1440 = 24h). */
  graceMinutes: number;
  /** Max rows to delete per run (default: 5000). */
  batchSize: number;
}

export interface SessionCleanupResult {
  expiredDeleted: number;
}

function defaultConfig(): SessionCleanupConfig {
  return {
    graceMinutes: Number(process.env.SESSION_CLEANUP_GRACE_MINUTES ?? 1440),
    batchSize: Number(process.env.SESSION_CLEANUP_BATCH_SIZE ?? 5000)
  };
}

export async function runSessionCleanupJob(
  config: SessionCleanupConfig = defaultConfig()
): Promise<SessionCleanupResult> {
  const pool = getPool();

  // Delete expired sessions (past expiry + grace period)
  const expiredResult = await pool.query(
    `
    delete from session
    where ctid in (
      select ctid from session
      where expires_at < now() - ($1 * interval '1 minute')
      limit $2
    )
    `,
    [config.graceMinutes, config.batchSize]
  );

  const result: SessionCleanupResult = {
    expiredDeleted: expiredResult.rowCount ?? 0
  };

  if (result.expiredDeleted > 0) {
    log('info', 'Session cleanup completed', { ...result });
  }

  return result;
}
