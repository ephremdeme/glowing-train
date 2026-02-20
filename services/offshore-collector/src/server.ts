import { loadOffshoreCollectorServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { buildOffshoreCollectorApp } from './app.js';

loadOffshoreCollectorServiceEnv();

runServiceAndExit({
  serviceName: 'offshore-collector',
  buildApp: buildOffshoreCollectorApp,
  defaultPort: 3002,
  portEnv: 'OFFSHORE_COLLECTOR_PORT',
  hostEnv: 'OFFSHORE_COLLECTOR_HOST',
  onShutdown: closeDb
});
