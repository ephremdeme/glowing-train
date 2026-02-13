import { closePool } from '@cryptopay/db';
import { log } from '@cryptopay/observability';
import { buildReconciliationApp } from './app.js';
import { runKeyVerification } from './jobs/key-verification.js';
import { runRetentionJob } from './jobs/retention.js';
import { ReconciliationService } from './modules/reconcile/index.js';

function safeIntervalMs(input: string | undefined, fallback: number): number {
  const value = Number(input ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function main(): Promise<void> {
  const app = await buildReconciliationApp();
  const reconciliationService = new ReconciliationService();

  const port = Number(process.env.RECONCILIATION_WORKER_PORT ?? '3004');
  const host = process.env.RECONCILIATION_WORKER_HOST ?? '0.0.0.0';
  const reconciliationIntervalMs = safeIntervalMs(process.env.RECONCILIATION_INTERVAL_MS, 5 * 60 * 1000);
  const retentionIntervalMs = safeIntervalMs(process.env.RETENTION_JOB_INTERVAL_MS, 60 * 60 * 1000);
  const keyVerificationIntervalMs = safeIntervalMs(process.env.KEY_VERIFICATION_INTERVAL_MS, 15 * 60 * 1000);

  await app.listen({ port, host });
  log('info', 'reconciliation-worker listening', { host, port });

  const timers: NodeJS.Timeout[] = [];
  if (process.env.RECONCILIATION_SCHEDULER_ENABLED !== 'false') {
    timers.push(
      setInterval(() => {
        void reconciliationService
          .runOnce(process.env.RECONCILIATION_SCHEDULED_OUTPUT_PATH)
          .then((result) => {
            log('info', 'scheduled reconciliation run completed', {
              runId: result.runId,
              issueCount: result.issueCount
            });
          })
          .catch((error) => {
            log('error', 'scheduled reconciliation run failed', { error: (error as Error).message });
          });
      }, reconciliationIntervalMs)
    );
  }

  if (process.env.RETENTION_SCHEDULER_ENABLED !== 'false') {
    timers.push(
      setInterval(() => {
        void runRetentionJob()
          .then((result) => {
            log('info', 'scheduled retention run completed', { ...result });
          })
          .catch((error) => {
            log('error', 'scheduled retention run failed', { error: (error as Error).message });
          });
      }, retentionIntervalMs)
    );
  }

  if (process.env.KEY_VERIFICATION_SCHEDULER_ENABLED !== 'false') {
    timers.push(
      setInterval(() => {
        void runKeyVerification()
          .then((result) => {
            log('info', 'scheduled key verification run completed', { ...result });
          })
          .catch((error) => {
            log('error', 'scheduled key verification run failed', { error: (error as Error).message });
          });
      }, keyVerificationIntervalMs)
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    log('warn', 'reconciliation-worker shutting down', { signal });
    for (const timer of timers) {
      clearInterval(timer);
    }
    await app.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  log('error', 'reconciliation-worker failed to start', {
    error: (error as Error).message
  });
  process.exit(1);
});
