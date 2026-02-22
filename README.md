# CryptoPay

Legal-first, crypto-funded remittance platform for Ethiopia.

## Frontend Quickstart

### 1. Install and configure
```bash
corepack prepare pnpm@9.15.5 --activate
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
- `WEB_CUSTOMER_AUTH_URL` default `http://localhost:3005`
- `WEB_OFFSHORE_COLLECTOR_URL` default `http://localhost:3002`
- `WEB_OPS_READ_TOKEN` optional ops token (legacy route support)
- `NEXT_PUBLIC_SOLANA_CLUSTER` default `devnet`
- `NEXT_PUBLIC_SOLANA_PROGRAM_ID` optional override (defaults to `apps/web/config/devnet.json` on devnet)
- `NEXT_PUBLIC_SOLANA_USDT_MINT` optional override
- `NEXT_PUBLIC_SOLANA_USDC_MINT` optional override
- `NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA` optional override
- `NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA` optional override
- `NEXT_PUBLIC_LANDING_USDC_ETB_RATE` default `140`
- `NEXT_PUBLIC_LANDING_USDT_ETB_RATE` default `140`
- `NEXT_PUBLIC_LANDING_FEE_USD` default `1`
- `NEXT_PUBLIC_WALLET_MODE`:
  - `real` uses injected EVM wallet + Solana wallet adapter
  - `mock` simulates wallet state (recommended for e2e)
- `GOOGLE_OAUTH_REDIRECT_URL` should target web callback:
  - `http://localhost:3000/auth/google/callback`

## Solana Anchor Devnet Pay Integration
- Source-of-truth files:
  - `apps/web/config/devnet.json`
  - `apps/web/config/remittance_acceptor.json`
- Required for local devnet pay flow:
  - `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
  - Keep `apps/web/config/devnet.json` values or set the `NEXT_PUBLIC_SOLANA_*` overrides above.
- Run:
```bash
pnpm install
pnpm dev:web
```
- In `/transfer`, create a transfer with `chain=solana`, then use **Pay with Solana wallet** in deposit instructions.

## Google OAuth
- Available from landing, signup, and login as `Continue with Google`.
- Google-authenticated users are signed in directly, no extra password login step.
- Web callback route: `/auth/google/callback`.

## Frontend Validation
```bash
pnpm --filter @cryptopay/web typecheck
pnpm --filter @cryptopay/web test:e2e
```

## Playwright MCP Notes
1. Configure `~/.codex/config.toml` with Playwright MCP and restart Codex desktop.
2. If MCP is unavailable in-session, run local Playwright e2e as fallback.

## MVP Guardrails
- Non-custodial only: sender uses their own wallet.
- No key handling or crypto balances in frontend.
- Transfer max is USD 2,000.
- MVP payout rail is bank transfer first.
