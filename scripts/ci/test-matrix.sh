#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-all}"

export NODE_ENV="${NODE_ENV:-test}"
export APP_REGION="${APP_REGION:-offshore}"
export DATABASE_URL="${DATABASE_URL:-postgres://cryptopay:cryptopay@localhost:55432/cryptopay}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export ETHIOPIA_SERVICES_CRYPTO_DISABLED="${ETHIOPIA_SERVICES_CRYPTO_DISABLED:-true}"
export AUTH_JWT_SECRET="${AUTH_JWT_SECRET:-test-jwt-secret}"
export AUTH_JWT_ISSUER="${AUTH_JWT_ISSUER:-cryptopay-internal}"
export AUTH_JWT_AUDIENCE="${AUTH_JWT_AUDIENCE:-cryptopay-services}"
export WATCHER_CALLBACK_SECRET="${WATCHER_CALLBACK_SECRET:-test-callback-secret}"

run_unit() {
  pnpm --filter @cryptopay/config test
  pnpm --filter @cryptopay/domain test
  pnpm --filter @cryptopay/adapters test
  pnpm --filter @cryptopay/auth test
  pnpm --filter @cryptopay/ops-cli test
  pnpm --filter @cryptopay/core-api exec vitest run test/quotes.unit.test.ts test/payout-link.unit.test.ts --pool=forks --poolOptions.forks.singleFork=true
  pnpm --filter @cryptopay/offshore-collector exec vitest run test/transfers.unit.test.ts --pool=forks --poolOptions.forks.singleFork=true
}

run_integration() {
  pnpm --filter @cryptopay/db test
  pnpm --filter @cryptopay/core-api exec vitest run "test/*.integration.test.ts" test/e2e.test.ts --pool=forks --poolOptions.forks.singleFork=true
  pnpm --filter @cryptopay/customer-auth test
  pnpm --filter @cryptopay/ledger-service test
  pnpm --filter @cryptopay/offshore-collector exec vitest run test/transfers.integration.test.ts --pool=forks --poolOptions.forks.singleFork=true
  pnpm --filter @cryptopay/payout-orchestrator test
  pnpm --filter @cryptopay/reconciliation-worker test
}

run_e2e() {
  pnpm exec vitest run tests/e2e/mvp-transfer-flow.test.ts --pool=forks --poolOptions.forks.singleFork=true
}

case "$MODE" in
  unit)
    run_unit
    ;;
  integration)
    run_integration
    ;;
  e2e)
    run_e2e
    ;;
  all)
    run_unit
    run_integration
    run_e2e
    ;;
  *)
    echo "Usage: $0 [unit|integration|e2e|all]" >&2
    exit 1
    ;;
esac
