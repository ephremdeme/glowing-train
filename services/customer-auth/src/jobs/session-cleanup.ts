/**
 * Session Cleanup Job
 *
 * Purges expired and revoked customer sessions from the database.
 * Runs periodically to keep the session table lean and accelerate
 * refresh-token lookups.
 */

import { getPool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

export interface SessionCleanupConfig {
    /** Additional grace period (minutes) beyond expiry before deletion (default: 1440 = 24h). */
    graceMinutes: number;
    /** Max rows to delete per run (default: 5000). */
    batchSize: number;
    /** Also delete sessions revoked more than `revokedGraceMinutes` ago (default: 60). */
    revokedGraceMinutes: number;
}

export interface SessionCleanupResult {
    expiredDeleted: number;
    revokedDeleted: number;
}

function defaultConfig(): SessionCleanupConfig {
    return {
        graceMinutes: Number(process.env.SESSION_CLEANUP_GRACE_MINUTES ?? 1440),
        batchSize: Number(process.env.SESSION_CLEANUP_BATCH_SIZE ?? 5000),
        revokedGraceMinutes: Number(process.env.SESSION_REVOKED_GRACE_MINUTES ?? 60)
    };
}

export async function runSessionCleanupJob(
    config: SessionCleanupConfig = defaultConfig()
): Promise<SessionCleanupResult> {
    const pool = getPool();

    // Delete expired sessions (past expiry + grace period)
    const expiredResult = await pool.query(
        `
    delete from customer_session
    where ctid in (
      select ctid from customer_session
      where expires_at < now() - ($1 * interval '1 minute')
      limit $2
    )
    `,
        [config.graceMinutes, config.batchSize]
    );

    // Delete revoked sessions (past revocation + grace period)
    const revokedResult = await pool.query(
        `
    delete from customer_session
    where ctid in (
      select ctid from customer_session
      where revoked_at is not null
        and revoked_at < now() - ($1 * interval '1 minute')
      limit $2
    )
    `,
        [config.revokedGraceMinutes, config.batchSize]
    );

    const result: SessionCleanupResult = {
        expiredDeleted: expiredResult.rowCount ?? 0,
        revokedDeleted: revokedResult.rowCount ?? 0
    };

    if (result.expiredDeleted > 0 || result.revokedDeleted > 0) {
        log('info', 'Session cleanup completed', { ...result });
    }

    return result;
}
