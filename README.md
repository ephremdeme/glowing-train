# CryptoPay

Legal-first, crypto-funded remittance platform for Ethiopia.

## Frontend Quickstart

### 1. Install and configure
```bash
corepack prepare pnpm@9.15.5 --activate
corepack pnpm install
cp .env.example .env
```

### 2. Start backend dependencies
```bash
docker compose up -d postgres redis
corepack pnpm --filter @cryptopay/db migrate
```

### 3. Start APIs required by the web app
```bash
corepack pnpm dev:customer-auth
corepack pnpm dev:core-api
corepack pnpm dev:offshore-collector
```

### 4. Run the web app
```bash
corepack pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

## Sender Journey (Multipage)
- Landing: [http://localhost:3000](http://localhost:3000)
- Signup: [http://localhost:3000/signup](http://localhost:3000/signup)
- Login: [http://localhost:3000/login](http://localhost:3000/login)
- Quote: [http://localhost:3000/quote](http://localhost:3000/quote)
- Transfer + Wallet Connect: [http://localhost:3000/transfer](http://localhost:3000/transfer)
- History: [http://localhost:3000/history](http://localhost:3000/history)
- Status: `http://localhost:3000/transfers/<transferId>`
- Receipt: `http://localhost:3000/receipts/<transferId>`

## Frontend Environment Variables
- `WEB_CORE_API_URL` default `http://localhost:3001`
- `WEB_OFFSHORE_COLLECTOR_URL` default `http://localhost:3002`
- `WEB_OPS_READ_TOKEN` optional ops token (legacy route support)
- `NEXT_PUBLIC_TELEBIRR_ENABLED` keep `false` for MVP
- `NEXT_PUBLIC_SOLANA_CLUSTER` default `mainnet-beta`
- `NEXT_PUBLIC_WALLET_MODE`:
  - `real` uses injected EVM wallet + Solana wallet adapter
  - `mock` simulates wallet state (recommended for e2e)

## Frontend Validation
```bash
corepack pnpm --filter @cryptopay/web typecheck
corepack pnpm --filter @cryptopay/web test:e2e
```

## Playwright MCP Notes
1. Configure `~/.codex/config.toml` with Playwright MCP and restart Codex desktop.
2. If MCP is unavailable in-session, run local Playwright e2e as fallback.

## MVP Guardrails
- Non-custodial only: sender uses their own wallet.
- No key handling or crypto balances in frontend.
- Transfer max is USD 2,000.
- MVP payout rail is bank transfer first.
