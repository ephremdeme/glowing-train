import { loadPayoutOrchestratorServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { buildPayoutOrchestratorApp } from './app.js';

loadPayoutOrchestratorServiceEnv();

runServiceAndExit({
  serviceName: 'payout-orchestrator',
  buildApp: buildPayoutOrchestratorApp,
  defaultPort: 3003,
  portEnv: 'PAYOUT_ORCHESTRATOR_PORT',
  hostEnv: 'PAYOUT_ORCHESTRATOR_HOST',
  onShutdown: closeDb
});
