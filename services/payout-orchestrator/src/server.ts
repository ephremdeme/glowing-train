import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildPayoutOrchestratorApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildPayoutOrchestratorApp();
  const port = Number(process.env.PAYOUT_ORCHESTRATOR_PORT ?? '3003');
  const host = process.env.PAYOUT_ORCHESTRATOR_HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  log('info', 'payout-orchestrator listening', { host, port });

  const shutdown = async (signal: string): Promise<void> => {
    log('warn', 'payout-orchestrator shutting down', { signal });
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log('error', 'payout-orchestrator failed to start', { error: (error as Error).message });
  process.exit(1);
});
