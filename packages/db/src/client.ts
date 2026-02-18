import { loadRuntimeConfig } from '@cryptopay/config';
import { Pool } from 'pg';
import { loadPoolConfig } from './pool-config.js';

let singletonPool: Pool | undefined;

export function getPool(): Pool {
  if (singletonPool) {
    return singletonPool;
  }

  const runtime = loadRuntimeConfig();
  const poolConfig = loadPoolConfig();

  singletonPool = new Pool({
    connectionString: runtime.DATABASE_URL,
    max: poolConfig.max,
    min: poolConfig.min,
    idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
    allowExitOnIdle: poolConfig.allowExitOnIdle
  });

  // Set statement timeout on each new client
  singletonPool.on('connect', (client) => {
    client.query(`set statement_timeout = '${poolConfig.statementTimeoutMs}'`).catch(() => {
      // Ignore — some test pools don't support this
    });
  });

  return singletonPool;
}

export async function dbHealthcheck(pool: Pool = getPool()): Promise<boolean> {
  const result = await pool.query('select 1 as ok');
  return result.rows[0]?.ok === 1;
}

export async function closePool(): Promise<void> {
  if (singletonPool) {
    await singletonPool.end();
    singletonPool = undefined;
  }
}
