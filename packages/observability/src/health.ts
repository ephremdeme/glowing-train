/**
 * Deep Health Check
 *
 * Goes beyond the basic /healthz ping by verifying actual
 * connectivity to critical dependencies (database, external services).
 * Returns structured status for each dependency.
 */

import { dbHealthcheck, getSql, loadDbConfig } from '@cryptopay/db';
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

async function checkDbClient(): Promise<DependencyCheck> {
    const sql = getSql();
    const config = loadDbConfig();
    const start = Date.now();
    try {
        await sql.unsafe('select 1');

        return {
            name: 'db_client',
            status: 'healthy',
            latencyMs: Date.now() - start,
            message: `postgres.js max=${config.maxConnections}`
        };
    } catch (error) {
        return {
            name: 'db_client',
            status: 'unhealthy',
            latencyMs: Date.now() - start,
            message: (error as Error).message
        };
    }
}

export async function deepHealthCheck(serviceName: string): Promise<DeepHealthResult> {
    const checks = await Promise.all([
        checkDatabase(),
        checkDbClient()
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
