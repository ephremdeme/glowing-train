/**
 * Transfer Expiry Job
 *
 * Expires transfers stuck in AWAITING_FUNDING beyond a configurable TTL.
 * Sets status to EXPIRED and retires the associated deposit route.
 */

import { getPool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

export interface TransferExpiryConfig {
    /** Max minutes a transfer can remain in AWAITING_FUNDING (default: 60). */
    expiryMinutes: number;
    /** Max transfers to expire per run (default: 100). */
    batchSize: number;
}

export interface TransferExpiryResult {
    expiredCount: number;
    transferIds: string[];
}

function defaultConfig(): TransferExpiryConfig {
    return {
        expiryMinutes: Number(process.env.TRANSFER_EXPIRY_MINUTES ?? 60),
        batchSize: Number(process.env.TRANSFER_EXPIRY_BATCH_SIZE ?? 100)
    };
}

export async function runTransferExpiryJob(
    config: TransferExpiryConfig = defaultConfig()
): Promise<TransferExpiryResult> {
    const pool = getPool();
    const client = await pool.connect();

    try {
        await client.query('begin');

        // Find and lock stale AWAITING_FUNDING transfers
        const staleTransfers = await client.query(
            `
      select transfer_id from transfers
      where status = 'AWAITING_FUNDING'
        and created_at < now() - ($1 * interval '1 minute')
      order by created_at asc
      limit $2
      for update skip locked
      `,
            [config.expiryMinutes, config.batchSize]
        );

        const transferIds: string[] = [];

        for (const row of staleTransfers.rows as Array<{ transfer_id: string }>) {
            const transferId = row.transfer_id;

            // Transition to EXPIRED
            await client.query(
                "update transfers set status = 'EXPIRED', updated_at = now() where transfer_id = $1",
                [transferId]
            );

            // Retire the deposit route
            await client.query(
                "update deposit_route set status = 'retired', updated_at = now() where transfer_id = $1 and status = 'active'",
                [transferId]
            );

            // Record the transition
            await client.query(
                `
        insert into transfer_transition (transfer_id, from_state, to_state, metadata)
        values ($1, 'AWAITING_FUNDING', 'EXPIRED', $2)
        `,
                [transferId, { reason: 'expiry_job', expiryMinutes: config.expiryMinutes }]
            );

            // Audit log
            await client.query(
                `
        insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
        values ($1,$2,$3,$4,$5,$6,$7)
        `,
                [
                    'system',
                    'transfer-expiry-job',
                    'transfer_expired',
                    'transfer',
                    transferId,
                    `Transfer expired after ${config.expiryMinutes} minutes without funding`,
                    { expiryMinutes: config.expiryMinutes }
                ]
            );

            transferIds.push(transferId);
        }

        await client.query('commit');

        if (transferIds.length > 0) {
            log('info', 'Transfer expiry job completed', {
                expiredCount: transferIds.length,
                transferIds
            });
        }

        return {
            expiredCount: transferIds.length,
            transferIds
        };
    } catch (error) {
        await client.query('rollback');
        log('error', 'Transfer expiry job failed', {
            error: (error as Error).message
        });
        throw error;
    } finally {
        client.release();
    }
}
