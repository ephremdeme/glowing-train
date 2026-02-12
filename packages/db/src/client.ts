import { loadRuntimeConfig } from '@cryptopay/config';
import { Pool } from 'pg';

let singletonPool: Pool | undefined;

export function getPool(): Pool {
  if (singletonPool) {
    return singletonPool;
  }

  const config = loadRuntimeConfig();
  singletonPool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000
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
