/**
 * Enhanced Database Connection Pool Configuration
 *
 * Provides environment-driven pool configuration with sensible
 * production defaults. Replaces hardcoded pool settings.
 */

export interface PoolConfig {
    /** Max pool connections (default: 20 for production, 5 for dev). */
    max: number;
    /** Min pool connections (default: 2). */
    min: number;
    /** Close idle clients after this many ms (default: 30s). */
    idleTimeoutMillis: number;
    /** Connection timeout in ms (default: 5s). */
    connectionTimeoutMillis: number;
    /** Statement timeout in ms (default: 30s). Prevents runaway queries. */
    statementTimeoutMs: number;
    /** Allow exit when no clients (default: true for dev, false for prod). */
    allowExitOnIdle: boolean;
}

export function loadPoolConfig(): PoolConfig {
    const env = process.env.NODE_ENV ?? 'development';
    const isProd = env === 'production';

    return {
        max: Number(process.env.DB_POOL_MAX ?? (isProd ? 20 : 5)),
        min: Number(process.env.DB_POOL_MIN ?? 2),
        idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
        connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5_000),
        statementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000),
        allowExitOnIdle: !isProd
    };
}
