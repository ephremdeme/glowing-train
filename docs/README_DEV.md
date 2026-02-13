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
docker compose up -d customer-auth core-api offshore-collector payout-orchestrator reconciliation-worker base-watcher solana-watcher web
```

## Run services on host (alternative)
```bash
corepack pnpm dev:core-api
corepack pnpm dev:customer-auth
corepack pnpm dev:offshore-collector
corepack pnpm dev:payout-orchestrator
corepack pnpm dev:reconciliation-worker
corepack pnpm dev:web
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

## Frontend Validation
```bash
corepack pnpm --filter @cryptopay/web typecheck
corepack pnpm --filter @cryptopay/web test:e2e
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
