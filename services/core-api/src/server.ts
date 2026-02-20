import { loadCoreApiServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { buildCoreApiApp } from './app.js';

loadCoreApiServiceEnv();

runServiceAndExit({
  serviceName: 'core-api',
  buildApp: buildCoreApiApp,
  defaultPort: 3001,
  portEnv: 'CORE_API_PORT',
  hostEnv: 'CORE_API_HOST',
  onShutdown: closeDb
});
