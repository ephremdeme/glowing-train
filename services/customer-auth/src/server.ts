import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { createEmailProvider, createSmsProvider } from '@cryptopay/adapters';
import { buildCustomerAuthApp } from './app.js';

async function main(): Promise<void> {
  const emailProvider = createEmailProvider({
    provider: (process.env['EMAIL_PROVIDER'] as 'resend' | 'mock') ?? 'mock',
    resendApiKey: process.env['RESEND_API_KEY'],
    defaultFrom: process.env['EMAIL_FROM'] ?? 'noreply@cryptopay.com'
  });

  const smsProvider = createSmsProvider({
    provider: (process.env['SMS_PROVIDER'] as 'africastalking' | 'mock') ?? 'mock',
    atApiKey: process.env['AT_API_KEY'],
    atUsername: process.env['AT_USERNAME'],
    atSenderId: process.env['AT_SENDER_ID']
  });

  const app = await buildCustomerAuthApp({ emailProvider, smsProvider });
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
