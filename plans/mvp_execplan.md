# CryptoPay MVP Execution Plan

## 1. Scope and Guardrails
This plan implements the MVP defined by `AGENTS.md` with these hard constraints:
- Ethiopia services remain crypto-free.
- Offshore domain handles all chain and stablecoin operations.
- Non-custodial sender funding only.
- USD 2,000 max transfer limit enforced.
- KYC status + receiver National ID verification fields are required.

## 2. Recommended Monorepo Structure
```text
cryptopay/
  AGENTS.md
  .agent/
    PLANS.md
  docs/
    PROJECT_BRIEF.md
    ARCHITECTURE.md
  plans/
    mvp_execplan.md
  docker-compose.yml
  .env.example
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
  services/
    core-api/                 # Ethiopia-side core remittance API (Node/TS, crypto-free)
    payout-orchestrator/      # Ethiopia-side payout orchestration (Node/TS, crypto-free)
    offshore-collector/       # Offshore transfer intake + deposit routing (Node/TS)
    reconciliation-worker/    # Ethiopia-side reconciliation + CSV export (Node/TS)
    ledger-service/           # Double-entry posting + queries (Node/TS)
  workers/
    base-watcher/             # Offshore Go watcher
    solana-watcher/           # Offshore Go watcher
  packages/
    domain/                   # Shared TS types/state machine/events (no transport)
    db/                       # Prisma/SQL migrations + typed DB client
    adapters/                 # KYC/payout adapter contracts + implementations
    config/                   # Env schema + config loader
    observability/            # Logging/metrics/tracing helpers
    testkit/                  # Test fixtures, mocks, and integration harness
```

## Milestone 1: Repository Bootstrap and Core Contracts

### Files to change
- `docker-compose.yml`
- `.env.example`
- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.base.json`
- `packages/config/*`
- `packages/domain/*`
- `packages/db/*`
- `docs/README_DEV.md`

### Commands to run
```bash
pnpm -w install
pnpm -w lint
pnpm -w typecheck
docker compose up -d postgres redis
pnpm -w test
```

### Test expectations
- Workspace installs and typechecks cleanly.
- DB connection smoke test passes.
- Domain package exports compile with no circular dependency failures.

### Acceptance criteria
- Monorepo skeleton exists with clear Ethiopia vs offshore boundaries.
- Shared domain types include transfer states, quote model, payout status enums.
- Environment schema exists and fails fast on missing required variables.

## Milestone 2: Quote Creation (Rate Lock + Expiry)

### Files to change
- `services/core-api/src/modules/quotes/*`
- `packages/domain/src/quote.ts`
- `packages/db/migrations/*_create_quotes.sql`
- `services/core-api/src/routes/quotes.ts`
- `services/core-api/test/quotes.*`

### Commands to run
```bash
pnpm --filter @cryptopay/db migrate
pnpm --filter @cryptopay/core-api test quotes
pnpm --filter @cryptopay/core-api typecheck
```

### Test expectations
- Unit tests for quote fee/rate calculations and expiry behavior.
- Integration tests for quote persistence and retrieval.
- Expired quote use is rejected with explicit error code.

### Acceptance criteria
- API can create quote with locked rate, fee, expiry timestamp.
- Quote expiry is enforced server-side.
- Quote includes max transfer validation against USD 2,000 cap.

## Milestone 3: Transfer Creation and Unique Deposit Route

### Files to change
- `services/offshore-collector/src/modules/transfers/*`
- `services/offshore-collector/src/modules/deposit-routes/*`
- `packages/db/migrations/*_create_transfers_and_routes.sql`
- `packages/domain/src/transfer.ts`
- `services/offshore-collector/test/transfers.*`

### Commands to run
```bash
pnpm --filter @cryptopay/db migrate
pnpm --filter @cryptopay/offshore-collector test transfers
pnpm --filter @cryptopay/offshore-collector typecheck
```

### Test expectations
- Unit tests for transfer creation validation: quote validity, KYC status, transfer cap.
- Integration tests guaranteeing one unique active deposit route per transfer.
- Duplicate create requests return idempotent prior response.

### Acceptance criteria
- Transfer created only when sender/receiver KYC requirements are satisfied.
- Each transfer has a unique deposit route (address or address+memo strategy) scoped by chain/token.
- Idempotency key enforcement exists for transfer creation endpoint.

## Milestone 4: Base + Solana Watchers (Funding Confirmation)

### Files to change
- `workers/base-watcher/cmd/main.go`
- `workers/base-watcher/internal/*`
- `workers/solana-watcher/cmd/main.go`
- `workers/solana-watcher/internal/*`
- `packages/domain/src/events.ts`
- `services/core-api/src/modules/funding-confirmations/*`
- `workers/*/test/*`

### Commands to run
```bash
go test ./workers/base-watcher/...
go test ./workers/solana-watcher/...
pnpm --filter @cryptopay/core-api test funding-confirmations
```

### Test expectations
- Watchers detect matching deposits for expected routes only.
- Duplicate chain events are deduplicated safely.
- Confirmation thresholds/finality settings are respected per chain.

### Acceptance criteria
- Normalized `FundingConfirmed` event emitted into core workflow.
- Transfer moves from `AWAITING_FUNDING` to `FUNDING_CONFIRMED` exactly once.
- No Ethiopia-side service uses chain SDK/RPC.

## Milestone 5: Payout Orchestration via Adapter Interface

### Files to change
- `packages/adapters/src/payout/*`
- `services/payout-orchestrator/src/modules/payouts/*`
- `services/payout-orchestrator/src/feature-flags.ts`
- `services/payout-orchestrator/test/payouts.*`
- `services/core-api/src/modules/payout-link/*`

### Commands to run
```bash
pnpm --filter @cryptopay/payout-orchestrator test
pnpm --filter @cryptopay/payout-orchestrator typecheck
pnpm --filter @cryptopay/core-api test payout-link
```

### Test expectations
- Bank adapter happy-path + retryable failure path tests pass.
- Telebirr adapter path remains disabled when feature flag off.
- Idempotent payout initiation verified.

### Acceptance criteria
- Payout adapter interface is stable and implementation-swappable.
- Bank payout path is functional in mock/sandbox mode.
- Telebirr integration is behind feature flag with no default execution path.

## Milestone 6: Double-Entry Ledger + Audit Log

### Files to change
- `services/ledger-service/src/modules/ledger/*`
- `services/core-api/src/modules/audit/*`
- `packages/db/migrations/*_create_ledger_and_audit.sql`
- `packages/domain/src/ledger.ts`
- `services/ledger-service/test/*`
- `services/core-api/test/audit.*`

### Commands to run
```bash
pnpm --filter @cryptopay/db migrate
pnpm --filter @cryptopay/ledger-service test
pnpm --filter @cryptopay/core-api test audit
```

### Test expectations
- Every financial event produces balanced debit and credit entries.
- Audit records captured for KYC update, status transitions, payout actions.
- Tamper-evident append-only behavior validated by tests.

### Acceptance criteria
- Ledger balances are mathematically consistent per transfer.
- Sensitive actions generate complete audit trail with actor, action, timestamp, reason.
- Secrets and raw private key data are never logged.

## Milestone 7: Reconciliation and CSV Report Output

### Files to change
- `services/reconciliation-worker/src/modules/reconcile/*`
- `services/reconciliation-worker/src/modules/reporting/csv.ts`
- `packages/db/migrations/*_create_reconciliation_tables.sql`
- `services/reconciliation-worker/test/*`
- `docs/OPERATIONS_RECONCILIATION.md`

### Commands to run
```bash
pnpm --filter @cryptopay/reconciliation-worker test
pnpm --filter @cryptopay/reconciliation-worker typecheck
pnpm -w test
```

### Test expectations
- Reconciliation detects mismatched statuses and missing callbacks.
- CSV output contains required columns and deterministic ordering.
- End-to-end scenario test confirms report generation from seeded data.

### Acceptance criteria
- Scheduled reconciliation run records run metadata and issues.
- CSV report generated for ops/compliance consumption.
- MVP critical flow is fully test-covered and executable locally.

## Milestone 8: End-to-End Hardening and SLA Tracking

### Files to change
- `services/*/src/observability/*`
- `packages/observability/*`
- `tests/e2e/mvp-transfer-flow.*`
- `docs/RUNBOOK_MVP.md`

### Commands to run
```bash
docker compose up -d
pnpm -w test
pnpm --filter @cryptopay/core-api test e2e
```

### Test expectations
- Full flow test: quote -> transfer -> funding confirm -> payout initiated/completed.
- SLA timer assertions from funding confirmation to payout completion.
- Replay/idempotency and retry behavior validated in E2E.

### Acceptance criteria
- MVP has one reproducible local E2E run.
- SLA metrics and logs are visible for bottleneck analysis.
- Runbook documents failure handling and manual-review path.

## 3. Cross-Milestone Definition of Done
- All new mutating paths implement idempotency.
- External integrations have bounded retry policy.
- Reconciliation coverage exists for every new state transition.
- Audit logs exist for all sensitive operations.
- Tests are added and pass before milestone close.
- Changes remain incremental and reviewable.
