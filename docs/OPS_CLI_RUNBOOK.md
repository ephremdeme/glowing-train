# Ops CLI Runbook

## Package
- Workspace package: `@cryptopay/ops-cli`
- Entry command: `ops-cli` (or `corepack pnpm --filter @cryptopay/ops-cli dev ...`)

## Required auth
Set an internal/admin JWT token:
```bash
export OPS_AUTH_TOKEN="<jwt>"
```

Optional defaults:
```bash
export OPS_API_URL="http://localhost:3001"
export OPS_ACTOR="ops-cli"
```

Per-command overrides:
- `--token <jwt>`
- `--api-url <url>`
- `--actor <actorId>`

## Read commands
```bash
ops-cli transfers list --status AWAITING_FUNDING --limit 50
ops-cli transfer inspect tr_123
ops-cli recon issues --since 2026-02-13T00:00:00Z
ops-cli recon run --reason "daily reconciliation" --output /tmp/recon.csv
```

## Write commands (reason required)
```bash
ops-cli payout retry tr_123 --reason "partner timeout"
ops-cli transfer mark-reviewed tr_123 --reason "manual KYC re-check"
ops-cli jobs retention-run --reason "retention housekeeping"
ops-cli jobs key-verification-run --reason "kms health check"
```

## Behavior
- CLI sends `Authorization: Bearer <token>`.
- CLI targets one ops entrypoint (`OPS_API_URL`, usually core-api) for all commands.
- CLI sets audit metadata headers (`x-ops-actor`, `x-ops-command`, `x-ops-reason` when present).
- CLI sets an `idempotency-key` header for POST commands.
- Write endpoints enforce `ops_admin` role.

## Troubleshooting
- `401/403`: verify token validity, issuer/audience, and role claim.
- `400 missing reason`: pass `--reason` for write commands.
- `404`: transfer/run not found in current environment.
