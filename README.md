# CryptoPay

Legal-first, crypto-funded remittance platform for Ethiopia.

## Frontend Quickstart

### 1. Install and configure
```bash
pnpm --version
pnpm install
cp .env.example .env
```

### 2. Start backend dependencies
```bash
docker compose up -d postgres redis
pnpm --filter @cryptopay/db migrate
```

### 3. Start APIs required by the web app
```bash
pnpm dev:customer-auth
pnpm dev:core-api
pnpm dev:offshore-collector
```

### 4. Run the web app
```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

## Core Routes
- Landing: [http://localhost:3000](http://localhost:3000)
- Signup: [http://localhost:3000/signup](http://localhost:3000/signup)
- Login: [http://localhost:3000/login](http://localhost:3000/login)
- Quote: [http://localhost:3000/quote](http://localhost:3000/quote)
- Transfer + Wallet Connect: [http://localhost:3000/transfer](http://localhost:3000/transfer)
- History: [http://localhost:3000/history](http://localhost:3000/history)
- Status: `http://localhost:3000/transfers/<transferId>`
- Receipt: `http://localhost:3000/receipts/<transferId>`

## Landing Quote Widget
- Landing includes an indicative estimator for `USDC/USDT -> ETB`.
- Clicking `Lock real quote` creates a real quote via `/api/client/quotes`.
- Routing behavior:
  - Authenticated sender: redirect to `/transfer`.
  - Unauthenticated sender: redirect to `/signup?next=/transfer` with locked quote draft preserved.

## Frontend Environment Variables
- `WEB_CORE_API_URL` default `http://localhost:3001`
- `WEB_OFFSHORE_COLLECTOR_URL` default `http://localhost:3002`
- `WEB_OPS_READ_TOKEN` optional ops token (legacy route support)
- `NEXT_PUBLIC_TELEBIRR_ENABLED` keep `false` for MVP
- `NEXT_PUBLIC_SOLANA_CLUSTER` default `mainnet-beta`
- `NEXT_PUBLIC_LANDING_USDC_ETB_RATE` default `140`
- `NEXT_PUBLIC_LANDING_USDT_ETB_RATE` default `140`
- `NEXT_PUBLIC_LANDING_FEE_USD` default `1`
- `NEXT_PUBLIC_WALLET_MODE`:
  - `real` uses injected EVM wallet + Solana wallet adapter
  - `mock` simulates wallet state (recommended for e2e)
- `GOOGLE_OAUTH_REDIRECT_URL` should target web callback:
  - `http://localhost:3000/auth/google/callback`

## Google OAuth
- Available from landing, signup, and login as `Continue with Google`.
- Google-authenticated users are signed in directly, no extra password login step.
- Web callback route: `/auth/google/callback`.

## Frontend Validation
```bash
pnpm --filter @cryptopay/web typecheck
pnpm --filter @cryptopay/web test:e2e
```

## Test Matrix
```bash
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

If integration tests need local infra first:
```bash
./scripts/ci/start-test-infra.sh
pnpm --filter @cryptopay/db migrate
```

## Deployment Assets (AWS VM + Docker, Blue/Green)
- Image build/sign/scan workflow: `.github/workflows/build-images.yml`
- Staging deployment workflow: `.github/workflows/deploy-staging.yml`
- Production deployment workflow: `.github/workflows/deploy-prod.yml`
- Blue/green compose files: `infra/compose/*.yml`
- Deploy scripts: `scripts/deploy/*.sh`
- Smoke checks: `scripts/smoke/*.sh`
- Edge routing config: `infra/edge/Caddyfile`

## Playwright MCP Notes
1. Configure `~/.codex/config.toml` with Playwright MCP and restart Codex desktop.
2. If MCP is unavailable in-session, run local Playwright e2e as fallback.

## MVP Guardrails
- Non-custodial only: sender uses their own wallet.
- No key handling or crypto balances in frontend.
- Transfer max is USD 2,000.
- MVP payout rail is bank transfer first.
