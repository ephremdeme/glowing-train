# Local Development

## Prerequisites
- Node.js 22+
- Docker + Docker Compose
- Corepack enabled (pnpm)
- Go toolchain (for watcher tests)

## Setup
```bash
corepack prepare pnpm@9.15.5 --activate
corepack pnpm install
cp .env.example .env
```

## Start infrastructure
```bash
docker compose up -d postgres redis
corepack pnpm --filter @cryptopay/db migrate
```

## Run all HTTP services in Docker
```bash
docker compose up -d customer-auth core-api offshore-collector payout-orchestrator reconciliation-worker base-watcher solana-watcher
```

## Run services on host (alternative)
```bash
corepack pnpm dev:core-api
corepack pnpm dev:customer-auth
corepack pnpm dev:offshore-collector
corepack pnpm dev:payout-orchestrator
corepack pnpm dev:reconciliation-worker
```

## Service endpoints
- Core API: `http://localhost:3001`
- Offshore Collector: `http://localhost:3002`
- Payout Orchestrator: `http://localhost:3003`
- Reconciliation Worker: `http://localhost:3004`
- Customer Auth (internal): `http://localhost:3005`

Each service exposes:
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Verify workspace
```bash
corepack pnpm -w lint
corepack pnpm -w typecheck
corepack pnpm -w test
corepack pnpm check:ethiopia-boundary
go test ./workers/base-watcher/...
go test ./workers/solana-watcher/...
```

## Ops CLI quickstart
```bash
export OPS_AUTH_TOKEN="<admin-jwt>"
corepack pnpm --filter @cryptopay/ops-cli dev transfers list --api-url http://localhost:3001
```

## Notes
- Keep `ETHIOPIA_SERVICES_CRYPTO_DISABLED=true` for Ethiopia-side processes.
- Telebirr remains feature-flagged off for MVP (`PAYOUT_TELEBIRR_ENABLED=false`).
- Customer auth is in scope in this stage (`customer-auth` service + `core-api` `/v1/auth/*` proxy).
