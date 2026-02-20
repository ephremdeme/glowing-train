export interface DbConfig {
  maxConnections: number;
  idleTimeoutSeconds: number;
  connectTimeoutSeconds: number;
  maxLifetimeSeconds: number;
  statementTimeoutMs: number;
  prepareStatements: boolean;
}

export function loadDbConfig(): DbConfig {
  const env = process.env.NODE_ENV ?? 'development';
  const isProd = env === 'production';

  return {
    maxConnections: Number(process.env.DB_POOL_MAX ?? (isProd ? 20 : 5)),
    idleTimeoutSeconds: Number(process.env.DB_IDLE_TIMEOUT_SECONDS ?? 30),
    connectTimeoutSeconds: Number(process.env.DB_CONNECT_TIMEOUT_SECONDS ?? 5),
    maxLifetimeSeconds: Number(process.env.DB_MAX_LIFETIME_SECONDS ?? 60 * 30),
    statementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 30_000),
    prepareStatements: (process.env.DB_PREPARE_STATEMENTS ?? 'false').toLowerCase() === 'true'
  };
}
