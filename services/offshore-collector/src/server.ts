import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildOffshoreCollectorApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildOffshoreCollectorApp();

  const port = Number(process.env.OFFSHORE_COLLECTOR_PORT ?? '3002');
  const host = process.env.OFFSHORE_COLLECTOR_HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  log('info', 'offshore-collector listening', { host, port });

  const shutdown = async (signal: string): Promise<void> => {
    log('warn', 'offshore-collector shutting down', { signal });
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log('error', 'offshore-collector failed to start', { error: (error as Error).message });
  process.exit(1);
});
