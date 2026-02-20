import { loadReconciliationWorkerServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { runKeyVerification, runRetentionJob } from '@cryptopay/ops-jobs';
import { log } from '@cryptopay/observability';
import { buildReconciliationApp } from './app.js';
import { ReconciliationService } from './modules/reconcile/index.js';

function safeIntervalMs(input: string | undefined, fallback: number): number {
  const value = Number(input ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

runServiceAndExit({
  serviceName: 'reconciliation-worker',
  buildApp: buildReconciliationApp,
  defaultPort: 3004,
  portEnv: 'RECONCILIATION_WORKER_PORT',
  hostEnv: 'RECONCILIATION_WORKER_HOST',
  onReady: async () => {
    const env = loadReconciliationWorkerServiceEnv();
    const reconciliationService = new ReconciliationService();
    const reconciliationIntervalMs = safeIntervalMs(String(env.RECONCILIATION_INTERVAL_MS), 5 * 60 * 1000);
    const retentionIntervalMs = safeIntervalMs(String(env.RETENTION_JOB_INTERVAL_MS), 60 * 60 * 1000);
    const keyVerificationIntervalMs = safeIntervalMs(String(env.KEY_VERIFICATION_INTERVAL_MS), 15 * 60 * 1000);

    const timers: NodeJS.Timeout[] = [];
    if (env.RECONCILIATION_SCHEDULER_ENABLED) {
      timers.push(
        setInterval(() => {
          void reconciliationService
            .runOnce(env.RECONCILIATION_SCHEDULED_OUTPUT_PATH)
            .then((result) => {
              log('info', 'scheduled reconciliation run completed', {
                runId: result.runId,
                issueCount: result.issueCount
              });
            })
            .catch((error) => {
              log('error', 'scheduled reconciliation run failed', {
                error: (error as Error).message
              });
            });
        }, reconciliationIntervalMs)
      );
    }

    if (env.RETENTION_SCHEDULER_ENABLED) {
      timers.push(
        setInterval(() => {
          void runRetentionJob()
            .then((result) => {
              log('info', 'scheduled retention run completed', { ...result });
            })
            .catch((error) => {
              log('error', 'scheduled retention run failed', {
                error: (error as Error).message
              });
            });
        }, retentionIntervalMs)
      );
    }

    if (env.KEY_VERIFICATION_SCHEDULER_ENABLED) {
      timers.push(
        setInterval(() => {
          void runKeyVerification()
            .then((result) => {
              log('info', 'scheduled key verification run completed', { ...result });
            })
            .catch((error) => {
              log('error', 'scheduled key verification run failed', {
                error: (error as Error).message
              });
            });
        }, keyVerificationIntervalMs)
      );
    }

    return () => {
      for (const timer of timers) {
        clearInterval(timer);
      }
    };
  },
  onShutdown: closeDb
});
