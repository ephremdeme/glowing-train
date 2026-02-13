import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildCoreApiApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildCoreApiApp();
  const port = Number(process.env.CORE_API_PORT ?? '3001');
  const host = process.env.CORE_API_HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  log('info', 'core-api listening', { host, port });

  const shutdown = async (signal: string): Promise<void> => {
    log('warn', 'core-api shutting down', { signal });
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log('error', 'core-api failed to start', { error: (error as Error).message });
  process.exit(1);
});
