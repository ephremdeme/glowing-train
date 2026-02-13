# MVP Runbook

## Critical Flow
1. Quote created (`QUOTE_CREATED` context).
2. Customer authenticates via `core-api /v1/auth/*` (proxied to `customer-auth`).
3. Sender KYC approved before first transfer.
4. Transfer created with unique deposit route (`AWAITING_FUNDING`).
5. Funding confirmed by watcher -> `FUNDING_CONFIRMED`.
6. Payout orchestration attempts bank payout -> `PAYOUT_INITIATED`.

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

## Operational Jobs
- Reconciliation run:
  - `ops-cli recon run --reason "daily reconciliation" --output /tmp/recon.csv`
- Retention run:
  - `ops-cli jobs retention-run --reason "retention housekeeping"`
- Key verification:
  - `ops-cli jobs key-verification-run --reason "kms health check"`

All write actions require `ops_admin` and are audited with actor + reason.

## Customer Auth Operations
- Validate customer session issuance/rotation:
  - `POST /v1/auth/register`
  - `POST /v1/auth/refresh`
- Validate sender KYC status gate:
  - `GET /v1/kyc/sender/status`
  - `POST /v1/kyc/sender/sumsub-token`
- Sumsub webhook ingestion:
  - `POST /internal/v1/kyc/sender/sumsub/webhook` with signed payload + idempotency key.

## Staging Dress Rehearsal
- Execute full flow and assert SLA (<10 minutes from funding confirmation to payout initiation).
- Drill duplicate funding callback replay and confirm idempotent no-op behavior.
- Drill payout retry exhaustion and confirm `PAYOUT_REVIEW_REQUIRED` transition.

## Core Commands
```bash
# bring up dependencies
docker compose up -d postgres redis

# apply all migrations
APP_REGION=ethiopia DATABASE_URL=postgres://cryptopay:cryptopay@localhost:55432/cryptopay REDIS_URL=redis://localhost:6379 ETHIOPIA_SERVICES_CRYPTO_DISABLED=true corepack pnpm --filter @cryptopay/db migrate

# run e2e flow
corepack pnpm exec vitest run tests/e2e/mvp-transfer-flow.test.ts
```
