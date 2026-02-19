# Local Development

## Prerequisites
- Node.js 22+
- Docker + Docker Compose
- Corepack enabled (pnpm)
- Go toolchain (for watcher tests)

## Setup
```bash
corepack prepare pnpm@9.15.5 --activate
pnpm install
cp .env.example .env
```

## Start infrastructure
```bash
docker compose up -d postgres redis
pnpm --filter @cryptopay/db migrate
```

## Run all HTTP services in Docker
```bash
docker compose up -d customer-auth core-api offshore-collector payout-orchestrator reconciliation-worker base-watcher solana-watcher web
```

## Production-like local simulation
Use the production compose topology with local image builds and isolated host ports.

```bash
cp .env.prod.example .env.prod.local
# edit .env.prod.local with local/sandbox values

APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim \
  -f docker-compose.prod.yml -f docker-compose.prod.sim.yml up -d --build postgres redis

APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim \
  -f docker-compose.prod.yml -f docker-compose.prod.sim.yml \
  run --rm --no-deps core-api node /app/node_modules/@cryptopay/db/dist/migrate.js

APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim \
  -f docker-compose.prod.yml -f docker-compose.prod.sim.yml up -d --build
```

Simulation endpoints:
- Core API: `http://localhost:13001`
- Web: `http://localhost:18080`
- Postgres: `localhost:15432`
- Redis: `localhost:16379`

Teardown:
```bash
APP_ENV_FILE=.env.prod.local docker compose --env-file .env.prod.local -p cryptopay-prod-sim \
  -f docker-compose.prod.yml -f docker-compose.prod.sim.yml down
```

Smoke automation (recommended):
```bash
./scripts/prod-sim-smoke.sh
```

Useful options:
- Keep the stack up after checks: `./scripts/prod-sim-smoke.sh --keep-running`
- Reuse already-built images: `./scripts/prod-sim-smoke.sh --no-build`

## Run services on host (alternative)
```bash
pnpm dev:core-api
pnpm dev:customer-auth
pnpm dev:offshore-collector
pnpm dev:payout-orchestrator
pnpm dev:reconciliation-worker
pnpm dev:web
```

## Service endpoints
- Core API: `http://localhost:3001`
- Offshore Collector: `http://localhost:3002`
- Payout Orchestrator: `http://localhost:3003`
- Reconciliation Worker: `http://localhost:3004`
- Customer Auth (internal): `http://localhost:3005`
- Web Client: `http://localhost:3000`

Each service exposes:
- `GET /healthz`
- `GET /readyz`
- `GET /metrics`

## Verify workspace
```bash
pnpm -w lint
pnpm -w typecheck
pnpm -w test
pnpm check:ethiopia-boundary
go test ./workers/base-watcher/...
go test ./workers/solana-watcher/...
```

## Ops CLI quickstart
```bash
export OPS_AUTH_TOKEN="<admin-jwt>"
pnpm --filter @cryptopay/ops-cli dev transfers list --api-url http://localhost:3001
```

## Notes
- Keep `ETHIOPIA_SERVICES_CRYPTO_DISABLED=true` for Ethiopia-side processes.
- Telebirr remains feature-flagged off for MVP (`PAYOUT_TELEBIRR_ENABLED=false`).
- Customer auth is in scope in this stage (`customer-auth` service + `core-api` `/v1/auth/*` proxy).

## Frontend Validation
```bash
pnpm --filter @cryptopay/web typecheck
pnpm --filter @cryptopay/web test:e2e
```

## Frontend multipage routes
- Landing: `http://localhost:3000/`
- Signup: `http://localhost:3000/signup`
- Login: `http://localhost:3000/login`
- Quote: `http://localhost:3000/quote`
- Transfer: `http://localhost:3000/transfer`
- Transfer history: `http://localhost:3000/history`
- Printable receipt: `http://localhost:3000/receipts/<transferId>`
- Status: `http://localhost:3000/transfers/<transferId>`
- Google OAuth callback: `http://localhost:3000/auth/google/callback`

## Landing converter behavior
- Landing computes an indicative ETB estimate from env-configured rate and fee.
- `Lock real quote` creates a real quote via web BFF and stores quote draft.
- If unauthenticated, user is routed to signup/login with `next=/transfer`.

## Wallet + UI env flags
- `NEXT_PUBLIC_WALLET_MODE=real|mock` (`mock` used by `dev:e2e`)
- `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta|devnet|testnet`
- `NEXT_PUBLIC_TELEBIRR_ENABLED=false` (MVP default)
- `NEXT_PUBLIC_LANDING_USDC_ETB_RATE=140`
- `NEXT_PUBLIC_LANDING_USDT_ETB_RATE=140`
- `NEXT_PUBLIC_LANDING_FEE_USD=1`
- `GOOGLE_OAUTH_REDIRECT_URL=http://localhost:3000/auth/google/callback`

## Playwright MCP notes
- Configure `~/.codex/config.toml` with Playwright MCP command.
- Restart Codex desktop after config updates to reload MCP servers.
- If MCP is unavailable in-session, use repo Playwright tests as fallback.
