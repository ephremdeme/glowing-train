import { loadBaseSweeperWorkerServiceEnv } from '@cryptopay/config';
import { closeDb } from '@cryptopay/db';
import { runServiceAndExit } from '@cryptopay/http';
import { log } from '@cryptopay/observability';
import { type Hex } from 'viem';
import { buildBaseSweeperWorkerApp } from './app.js';
import { SettlementSweeperRepository } from './modules/sweeper/repository.js';
import { BaseSweepService } from './modules/sweeper/service.js';

runServiceAndExit({
  serviceName: 'base-sweeper-worker',
  buildApp: buildBaseSweeperWorkerApp,
  defaultPort: 3006,
  portEnv: 'BASE_SWEEPER_WORKER_PORT',
  hostEnv: 'BASE_SWEEPER_WORKER_HOST',
  onReady: async () => {
    const env = loadBaseSweeperWorkerServiceEnv();
    const repository = new SettlementSweeperRepository(env.BASE_SWEEP_RECLAIM_TIMEOUT_MS);
    const service = new BaseSweepService(repository, {
      rpcUrl: env.BASE_RPC_URL,
      network: env.BASE_NETWORK,
      factoryAddress: env.BASE_DEPOSIT_FACTORY_ADDRESS as Hex,
      ownerPrivateKey: env.BASE_SWEEP_OWNER_PRIVATE_KEY,
      tokenContracts: {
        USDC: env.BASE_USDC_CONTRACT as Hex,
        USDT: env.BASE_USDT_CONTRACT as Hex
      },
      batchSize: env.BASE_SWEEP_BATCH_SIZE,
      maxAttempts: env.BASE_SWEEP_MAX_ATTEMPTS,
      retryBaseMs: env.BASE_SWEEP_RETRY_BASE_MS
    });

    const runOnce = async () => {
      const result = await service.runBatch();
      if (result.swept || result.retried || result.reviewRequired) {
        log('info', 'base sweep batch complete', result);
      }
    };

    const timer = setInterval(() => {
      void runOnce().catch((error) => {
        log('error', 'base sweep batch failed', {
          error: (error as Error).message
        });
      });
    }, env.BASE_SWEEP_POLL_INTERVAL_MS);

    await runOnce().catch((error) => {
      log('error', 'base sweep initial batch failed', {
        error: (error as Error).message
      });
    });

    return () => {
      clearInterval(timer);
    };
  },
  onShutdown: closeDb
});
