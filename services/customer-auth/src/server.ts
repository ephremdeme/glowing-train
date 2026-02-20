import { loadCustomerAuthServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { buildCustomerAuthApp } from './app.js';

loadCustomerAuthServiceEnv();

runServiceAndExit({
  serviceName: 'customer-auth',
  buildApp: buildCustomerAuthApp,
  defaultPort: 3005,
  portEnv: 'CUSTOMER_AUTH_PORT',
  hostEnv: 'CUSTOMER_AUTH_HOST',
  onShutdown: closeDb
});
