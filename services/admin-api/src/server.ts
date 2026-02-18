import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildAdminApiApp } from './app.js';

async function main(): Promise<void> {
    const app = await buildAdminApiApp();
    const port = Number(process.env.ADMIN_API_PORT ?? '3010');
    const host = process.env.ADMIN_API_HOST ?? '0.0.0.0';

    await app.listen({ port, host });
    log('info', 'admin-api listening', { host, port });

    const shutdown = async (signal: string): Promise<void> => {
        log('warn', 'admin-api shutting down', { signal });
        await app.close();
        await closePool();
        process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
    log('error', 'admin-api failed to start', {
        error: (error as Error).message
    });
    process.exit(1);
});
