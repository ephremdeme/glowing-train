export {
  closeDb,
  dbHealthcheck,
  getDb,
  getSql,
  query,
  withTransaction,
  type QueryResult,
  type Queryable
} from './client.js';
export { loadDbConfig, type DbConfig } from './pool-config.js';
export * as schema from './schema/index.js';
