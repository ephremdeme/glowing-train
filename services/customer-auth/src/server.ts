import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { createEmailProvider, createSmsProvider } from '@cryptopay/adapters';
import { buildCustomerAuthApp } from './app.js';

async function main(): Promise<void> {
  const emailProviderConfig: {
    provider: 'resend' | 'mock';
    resendApiKey?: string;
    defaultFrom?: string;
  } = {
    provider: (process.env['EMAIL_PROVIDER'] as 'resend' | 'mock') ?? 'mock',
    defaultFrom: process.env['EMAIL_FROM'] ?? 'noreply@cryptopay.com'
  };

  if (process.env['RESEND_API_KEY']) {
    emailProviderConfig.resendApiKey = process.env['RESEND_API_KEY'];
  }

  const emailProvider = createEmailProvider(emailProviderConfig);

  const smsProviderConfig: {
    provider: 'africastalking' | 'mock';
    atApiKey?: string;
    atUsername?: string;
    atSenderId?: string;
  } = {
    provider: (process.env['SMS_PROVIDER'] as 'africastalking' | 'mock') ?? 'mock'
  };

  if (process.env['AT_API_KEY']) {
    smsProviderConfig.atApiKey = process.env['AT_API_KEY'];
  }

  if (process.env['AT_USERNAME']) {
    smsProviderConfig.atUsername = process.env['AT_USERNAME'];
  }

  if (process.env['AT_SENDER_ID']) {
    smsProviderConfig.atSenderId = process.env['AT_SENDER_ID'];
  }

  const smsProvider = createSmsProvider(smsProviderConfig);

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
