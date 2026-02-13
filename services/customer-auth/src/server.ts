import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildCustomerAuthApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildCustomerAuthApp();
  const port = Number(process.env.CUSTOMER_AUTH_PORT ?? '3005');
  const host = process.env.CUSTOMER_AUTH_HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  log('info', 'customer-auth listening', { host, port });

  const shutdown = async (signal: string): Promise<void> => {
    log('warn', 'customer-auth shutting down', { signal });
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log('error', 'customer-auth failed to start', {
    error: (error as Error).message
  });
  process.exit(1);
});
