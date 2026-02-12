# Local Development (Milestone 1)

## Prerequisites
- Node.js 22+
- Docker + Docker Compose
- Corepack enabled (for pnpm)

## Setup
```bash
corepack prepare pnpm@9.15.5 --activate
corepack pnpm install
cp .env.example .env
```

## Start local dependencies
```bash
docker compose up -d postgres redis
```

## Verify workspace
```bash
corepack pnpm -w lint
corepack pnpm -w typecheck
corepack pnpm -w test
```

## Default local endpoints
- Postgres: `localhost:55432`
- Redis: `localhost:6379`

## Notes
- The DB package includes a connection smoke test against `DATABASE_URL`.
- Keep `ETHIOPIA_SERVICES_CRYPTO_DISABLED=true` for Ethiopia-side processes.
