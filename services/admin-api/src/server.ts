import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { buildAdminApiApp } from './app.js';

runServiceAndExit({
  serviceName: 'admin-api',
  buildApp: buildAdminApiApp,
  defaultPort: 3010,
  portEnv: 'ADMIN_API_PORT',
  hostEnv: 'ADMIN_API_HOST',
  onShutdown: closeDb
});
