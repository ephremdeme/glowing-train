# Local Development

## Prerequisites
- Node.js 22+
- Docker + Docker Compose
- pnpm 9.15.5+
- Go 1.22+ (watcher tests)

## Setup
```bash
pnpm --version
pnpm install
cp .env.example .env
```

## Start local dependencies (lightweight)
```bash
docker compose up -d postgres redis
pnpm --filter @cryptopay/db migrate
```

## Start services (host mode)
```bash
pnpm dev:customer-auth
pnpm dev:core-api
pnpm dev:offshore-collector
pnpm dev:payout-orchestrator
pnpm dev:reconciliation-worker
pnpm dev:web
```

## Start all services in Docker (dev mode)
```bash
docker compose up -d customer-auth core-api offshore-collector payout-orchestrator reconciliation-worker base-watcher solana-watcher web
```

## Service endpoints
- Core API: `http://localhost:3001`
- Offshore Collector: `http://localhost:3002`
- Payout Orchestrator: `http://localhost:3003`
- Reconciliation Worker: `http://localhost:3004`
- Customer Auth: `http://localhost:3005`
- Web: `http://localhost:3000`

Each service exposes:
- `GET /healthz`
- `GET /readyz`
- `GET /version`
- `GET /metrics`

## Validation and test matrix

### Full validation
```bash
pnpm check:ethiopia-boundary
pnpm -w lint
pnpm -w typecheck
pnpm go:test
```

### Unit-only suites
```bash
pnpm test:unit
```

### DB integration suites
```bash
./scripts/ci/start-test-infra.sh
pnpm --filter @cryptopay/db migrate
pnpm test:integration
```

### End-to-end MVP flow
```bash
pnpm test:e2e
```

## Production-like compose specs
Blue/green compose files are in:
- `infra/compose/ethiopia.blue.yml`
- `infra/compose/ethiopia.green.yml`
- `infra/compose/offshore.blue.yml`
- `infra/compose/offshore.green.yml`

## Environment guardrails
- `ETHIOPIA_SERVICES_CRYPTO_DISABLED=true` must remain true for Ethiopia domain services.
- `PAYOUT_TELEBIRR_ENABLED=false` for MVP.
- Runtime deployment metadata variables:
  - `RELEASE_ID`
  - `GIT_SHA`
  - `DEPLOY_COLOR`
  - `ENVIRONMENT`
