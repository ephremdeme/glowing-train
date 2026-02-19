# MVP Runbook

## Critical flow
1. Quote created (`QUOTE_CREATED`).
2. Customer authenticates via `core-api` proxy routes.
3. Sender and receiver KYC gates pass.
4. Transfer created with unique deposit route (`AWAITING_FUNDING`).
5. Watcher callback confirms funding (`FUNDING_CONFIRMED`).
6. Payout orchestration initiates bank payout (`PAYOUT_INITIATED`).

## Runtime health and version checks
Use these for smoke validation:
- `GET /healthz`
- `GET /readyz`
- `GET /version`
- `GET /metrics`

## Blue/green operations
Deploy inactive color first:
```bash
./scripts/deploy/deploy_color.sh --domain ethiopia --color green --environment staging --image-tag <sha>
./scripts/deploy/deploy_color.sh --domain offshore --color green --environment staging --image-tag <sha>
```

Validate:
```bash
./scripts/smoke/ethiopia_smoke.sh --base-url https://staging-ethiopia.example.com
./scripts/smoke/offshore_smoke.sh --base-url https://staging-offshore.example.com
```

Switch traffic:
```bash
./scripts/deploy/switch_color.sh --color green --environment staging
```

Rollback:
```bash
./scripts/deploy/rollback.sh --environment staging
```

## Failure handling
- Retryable partner failures: bounded retries with backoff/jitter.
- Non-retryable failures: transition to `PAYOUT_REVIEW_REQUIRED` and audit.
- Watcher replay/duplicates: idempotent no-op with preserved transition integrity.

## Manual review path
Inspect:
- `payout_instruction.last_error`
- transfer transition history
- `audit_log`
- `reconciliation_issue`

Then:
- Retry payout (audited reason required), or
- mark transfer reviewed with remediation notes.

## Operational jobs
```bash
ops-cli recon run --reason "daily reconciliation" --output /tmp/recon.csv
ops-cli jobs retention-run --reason "retention housekeeping"
ops-cli jobs key-verification-run --reason "kms health check"
```

## Production guarded window
After deploying inactive color, run:
```bash
./scripts/smoke/ethiopia_smoke.sh --base-url https://prod-ethiopia.example.com --observe-seconds 600
./scripts/smoke/offshore_smoke.sh --base-url https://prod-offshore.example.com --observe-seconds 600
```
Switch color only if both pass.
