/**
 * Deep Health Check
 *
 * Goes beyond the basic /healthz ping by verifying actual
 * connectivity to critical dependencies (database, external services).
 * Returns structured status for each dependency.
 */

import { getPool, dbHealthcheck } from '@cryptopay/db';
import { log } from '@cryptopay/observability';

export type DependencyStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyCheck {
    name: string;
    status: DependencyStatus;
    latencyMs: number;
    message?: string;
}

export interface DeepHealthResult {
    status: DependencyStatus;
    service: string;
    uptime: number;
    checks: DependencyCheck[];
    timestamp: string;
}

const startedAt = Date.now();

async function checkDatabase(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
        const ok = await dbHealthcheck();
        return {
            name: 'database',
            status: ok ? 'healthy' : 'degraded',
            latencyMs: Date.now() - start
        };
    } catch (error) {
        return {
            name: 'database',
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            message: (error as Error).message
        };
    }
}

async function checkPoolStats(): Promise<DependencyCheck> {
    const pool = getPool();
    const start = Date.now();
    try {
        // pg Pool exposes these stats
        const total = (pool as unknown as { totalCount: number }).totalCount ?? 0;
        const idle = (pool as unknown as { idleCount: number }).idleCount ?? 0;
        const waiting = (pool as unknown as { waitingCount: number }).waitingCount ?? 0;

        const status: DependencyStatus = waiting > 5 ? 'degraded' : 'healthy';
        return {
            name: 'db_pool',
            status,
            latencyMs: Date.now() - start,
            message: `total=${total} idle=${idle} waiting=${waiting}`
        };
    } catch (error) {
        return {
            name: 'db_pool',
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            message: (error as Error).message
        };
    }
}

export async function deepHealthCheck(serviceName: string): Promise<DeepHealthResult> {
    const checks = await Promise.all([
        checkDatabase(),
        checkPoolStats()
    ]);

    const overallStatus: DependencyStatus = checks.some((c) => c.status === 'unhealthy')
        ? 'unhealthy'
        : checks.some((c) => c.status === 'degraded')
            ? 'degraded'
            : 'healthy';

    const result: DeepHealthResult = {
        status: overallStatus,
        service: serviceName,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        checks,
        timestamp: new Date().toISOString()
    };

    if (overallStatus !== 'healthy') {
        log('warn', 'Deep health check not healthy', {
            service: serviceName,
            status: overallStatus,
            checks
        });
    }

    return result;
}
