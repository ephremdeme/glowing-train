/**
 * SLA Timer Enforcement Job
 *
 * Detects transfers that are stuck in non-terminal states beyond SLA limits.
 * Flags them for ops review and optionally escalates via notifications.
 *
 * Unlike the expiry job (which transitions state), this job only monitors
 * and creates alerts — it doesn't change transfer state.
 */

import { PAYOUT_SLA_MINUTES } from '@cryptopay/domain';
import { getPool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

export interface SlaConfig {
    /** Max minutes for PAYOUT_INITIATED before flagging (default: PAYOUT_SLA_MINUTES). */
    payoutSlaMinutes: number;
    /** Max minutes for FUNDING_CONFIRMED before flagging (default: 30). */
    fundingConfirmedSlaMinutes: number;
    /** Max breaches to process per run (default: 50). */
    batchSize: number;
}

export interface SlaBreach {
    transferId: string;
    currentStatus: string;
    slaMinutes: number;
    ageMinutes: number;
    breachType: 'payout_sla' | 'funding_sla';
}

export interface SlaEnforcementResult {
    breaches: SlaBreach[];
    totalBreaches: number;
}

function defaultConfig(): SlaConfig {
    return {
        payoutSlaMinutes: Number(process.env.PAYOUT_SLA_MINUTES ?? PAYOUT_SLA_MINUTES),
        fundingConfirmedSlaMinutes: Number(process.env.FUNDING_CONFIRMED_SLA_MINUTES ?? 30),
        batchSize: Number(process.env.SLA_ENFORCEMENT_BATCH_SIZE ?? 50)
    };
}

export async function runSlaEnforcementJob(
    config: SlaConfig = defaultConfig()
): Promise<SlaEnforcementResult> {
    const pool = getPool();
    const breaches: SlaBreach[] = [];

    // Check PAYOUT_INITIATED transfers exceeding payout SLA
    const payoutBreaches = await pool.query(
        `
    select transfer_id, status, created_at,
           extract(epoch from (now() - updated_at)) / 60 as age_minutes
    from transfers
    where status = 'PAYOUT_INITIATED'
      and updated_at < now() - ($1 * interval '1 minute')
    order by updated_at asc
    limit $2
    `,
        [config.payoutSlaMinutes, config.batchSize]
    );

    for (const row of payoutBreaches.rows as Array<{
        transfer_id: string;
        status: string;
        age_minutes: number;
    }>) {
        breaches.push({
            transferId: row.transfer_id,
            currentStatus: row.status,
            slaMinutes: config.payoutSlaMinutes,
            ageMinutes: Math.round(row.age_minutes),
            breachType: 'payout_sla'
        });
    }

    // Check FUNDING_CONFIRMED transfers exceeding funding-to-payout SLA
    const fundingBreaches = await pool.query(
        `
    select transfer_id, status, created_at,
           extract(epoch from (now() - updated_at)) / 60 as age_minutes
    from transfers
    where status = 'FUNDING_CONFIRMED'
      and updated_at < now() - ($1 * interval '1 minute')
    order by updated_at asc
    limit $2
    `,
        [config.fundingConfirmedSlaMinutes, config.batchSize]
    );

    for (const row of fundingBreaches.rows as Array<{
        transfer_id: string;
        status: string;
        age_minutes: number;
    }>) {
        breaches.push({
            transferId: row.transfer_id,
            currentStatus: row.status,
            slaMinutes: config.fundingConfirmedSlaMinutes,
            ageMinutes: Math.round(row.age_minutes),
            breachType: 'funding_sla'
        });
    }

    // Record breaches as audit log entries
    for (const breach of breaches) {
        await pool.query(
            `
      insert into audit_log (actor_type, actor_id, action, entity_type, entity_id, reason, metadata)
      values ($1,$2,$3,$4,$5,$6,$7)
      on conflict do nothing
      `,
            [
                'system',
                'sla-enforcement-job',
                'sla_breach_detected',
                'transfer',
                breach.transferId,
                `SLA breach: ${breach.breachType} — ${breach.ageMinutes}min exceeds ${breach.slaMinutes}min limit`,
                breach
            ]
        );
    }

    if (breaches.length > 0) {
        log('warn', 'SLA breaches detected', {
            totalBreaches: breaches.length,
            payout: breaches.filter((b) => b.breachType === 'payout_sla').length,
            funding: breaches.filter((b) => b.breachType === 'funding_sla').length
        });
    }

    return {
        breaches,
        totalBreaches: breaches.length
    };
}
