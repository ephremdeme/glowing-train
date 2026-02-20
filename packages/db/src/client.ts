import { loadRuntimeConfig } from '@cryptopay/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';
import { loadDbConfig } from './pool-config.js';

type QueryRow = Record<string, unknown>;
type PostgresSql = ReturnType<typeof postgres>;

let singletonSql: PostgresSql | undefined;
let singletonDb: PostgresJsDatabase<typeof schema> | undefined;

export interface QueryResult<Row extends QueryRow = QueryRow> {
  rows: Row[];
  rowCount: number;
}

export interface QueryClient {
  query: <Row extends QueryRow = QueryRow>(sql: string, params?: unknown[]) => Promise<QueryResult<Row>>;
  release: () => void;
}

export interface Queryable {
  query: <Row extends QueryRow = QueryRow>(sql: string, params?: unknown[]) => Promise<QueryResult<Row>>;
  connect: () => Promise<QueryClient>;
}

function withStatementTimeout(connectionString: string, statementTimeoutMs: number): string {
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has('statement_timeout')) {
      url.searchParams.set('statement_timeout', String(statementTimeoutMs));
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function toRowCount(rows: { length: number; count?: unknown }): number {
  const resultCount = rows.count;
  if (typeof resultCount === 'number') {
    return resultCount;
  }
  if (typeof resultCount === 'bigint') {
    return Number(resultCount);
  }
  if (typeof resultCount === 'string') {
    const parsed = Number(resultCount);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return rows.length;
}

function createQueryAdapter(sql: PostgresSql): Queryable {
  const query: Queryable['query'] = async <Row extends QueryRow = QueryRow>(
    queryText: string,
    params: unknown[] = []
  ): Promise<QueryResult<Row>> => {
    const rows = (await sql.unsafe(queryText, params as never[])) as unknown as QueryRow[] & {
      count?: unknown;
      length: number;
    };
    return {
      rows: rows as unknown as Row[],
      rowCount: toRowCount(rows)
    };
  };

  return {
    query,
    connect: async (): Promise<QueryClient> => {
      const reserved = await sql.reserve();
      const reservedSql = reserved as unknown as PostgresSql;
      const reservedAdapter = createQueryAdapter(reservedSql);
      return {
        query: reservedAdapter.query,
        release: () => {
          void reserved.release();
        }
      };
    }
  };
}

export function getSql(): PostgresSql {
  if (singletonSql) {
    return singletonSql;
  }

  const runtime = loadRuntimeConfig();
  const config = loadDbConfig();
  const connectionString = withStatementTimeout(runtime.DATABASE_URL, config.statementTimeoutMs);

  singletonSql = postgres(connectionString, {
    max: config.maxConnections,
    idle_timeout: config.idleTimeoutSeconds,
    connect_timeout: config.connectTimeoutSeconds,
    max_lifetime: config.maxLifetimeSeconds,
    prepare: config.prepareStatements
  });

  return singletonSql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!singletonDb) {
    singletonDb = drizzle(getSql(), { schema });
  }
  return singletonDb;
}

export async function query<Row extends QueryRow = QueryRow>(
  queryText: string,
  params: unknown[] = []
): Promise<QueryResult<Row>> {
  return createQueryAdapter(getSql()).query<Row>(queryText, params);
}

export async function withTransaction<T>(
  fn: (tx: {
    sql: PostgresSql;
    db: PostgresJsDatabase<typeof schema>;
    query: <Row extends QueryRow = QueryRow>(queryText: string, params?: unknown[]) => Promise<QueryResult<Row>>;
  }) => Promise<T>
): Promise<T> {
  const sql = getSql();
  return sql.begin(async (transactionSql) => {
    const txSql = transactionSql as unknown as PostgresSql;
    const txQuery = createQueryAdapter(txSql);
    const txDb = drizzle(txSql, { schema });
    return fn({
      sql: txSql,
      db: txDb,
      query: txQuery.query
    });
  }) as Promise<T>;
}

export async function dbHealthcheck(): Promise<boolean> {
  const result = await query<{ ok: number }>('select 1 as ok');
  return result.rows[0]?.ok === 1;
}

export async function closeDb(): Promise<void> {
  if (singletonSql) {
    await singletonSql.end({ timeout: 5 });
    singletonSql = undefined;
    singletonDb = undefined;
  }
}

// Temporary compatibility aliases during hard-cut rollout.
export function getPool(): Queryable {
  return createQueryAdapter(getSql());
}

export async function closePool(): Promise<void> {
  await closeDb();
}
