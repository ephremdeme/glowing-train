# MVP Runbook

## Critical Flow
1. Quote created (`QUOTE_CREATED` context).
2. Transfer created with unique deposit route (`AWAITING_FUNDING`).
3. Funding confirmed by watcher -> `FUNDING_CONFIRMED`.
4. Payout orchestration attempts bank payout -> `PAYOUT_INITIATED`.

## Failure Handling
- Retryable partner failures:
  - auto-retried with bounded attempts in payout orchestrator.
- Non-retryable failures:
  - transfer and payout move to `PAYOUT_REVIEW_REQUIRED`.
  - audit log entry is written with error context.

## Manual Review Path
- Query transfers in `PAYOUT_REVIEW_REQUIRED`.
- Inspect:
  - `payout_instruction.last_error`
  - `audit_log` rows for transfer
  - `reconciliation_issue` records
- Resolve and document reason in a manual audit entry.

## Core Commands
```bash
# bring up dependencies
docker compose up -d postgres redis

# apply all migrations
APP_REGION=ethiopia DATABASE_URL=postgres://cryptopay:cryptopay@localhost:55432/cryptopay REDIS_URL=redis://localhost:6379 ETHIOPIA_SERVICES_CRYPTO_DISABLED=true corepack pnpm --filter @cryptopay/db migrate

# run e2e flow
corepack pnpm exec vitest run tests/e2e/mvp-transfer-flow.test.ts
```
