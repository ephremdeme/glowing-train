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

### 5. Use new sender pages
- History: [http://localhost:3000/history](http://localhost:3000/history)
- Receipt: `http://localhost:3000/receipts/<transferId>`

## Frontend Environment Variables
- `WEB_CORE_API_URL` default `http://localhost:3001`
- `WEB_OFFSHORE_COLLECTOR_URL` default `http://localhost:3002`
- `WEB_OPS_READ_TOKEN` required for transfer status polling route (`/api/client/transfers/:id`)
- `NEXT_PUBLIC_TELEBIRR_ENABLED` keep `false` for MVP

## Frontend E2E
```bash
corepack pnpm --filter @cryptopay/web typecheck
corepack pnpm --filter @cryptopay/web test:e2e
```

## Playwright MCP Setup
1. Ensure `~/.codex/config.toml` includes:
```toml
[mcp_servers.playwright]
command = "/opt/homebrew/bin/playwright-mcp"
args = []
```
2. Restart Codex desktop so MCP servers reload.
3. If MCP still does not appear, continue with local Playwright CLI (`pnpm --filter @cryptopay/web test:e2e`) for browser validation.

## MVP Guardrails
- Non-custodial only: sender uses their own wallet.
- No key handling or crypto balances in frontend.
- Transfer max is USD 2,000.
- MVP payout rail is bank transfer first.
