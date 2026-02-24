# Docker Build Guide

This repo now uses shared Dockerfiles for Node services and the web app to reduce duplication and keep caching behavior consistent.

## Shared Dockerfiles

- Node services: `docker/node.Dockerfile`
- Web app (Next.js): `docker/web.Dockerfile`
- Go watchers remain service-specific:
  - `workers/base-watcher/Dockerfile`
  - `workers/solana-watcher/Dockerfile`

## Node Service Build Args

Build all Node services with `docker/node.Dockerfile` and pass:
- `SERVICE_NAME` (required)
- `SERVICE_PORT` (used for `EXPOSE` and healthcheck fallback)

Service mapping:

| Service | `SERVICE_NAME` | `SERVICE_PORT` |
|---|---|---:|
| Core API | `core-api` | `3001` |
| Offshore Collector | `offshore-collector` | `3002` |
| Payout Orchestrator | `payout-orchestrator` | `3003` |
| Reconciliation Worker | `reconciliation-worker` | `3004` |
| Customer Auth | `customer-auth` | `3005` |
| Admin API | `admin-api` | `3010` |

Example:

```bash
docker build -f docker/node.Dockerfile \
  --build-arg SERVICE_NAME=core-api \
  --build-arg SERVICE_PORT=3001 \
  -t cryptopay/core-api:local .
```

## Web Build

Build the frontend with `docker/web.Dockerfile`.

Example:

```bash
docker build -f docker/web.Dockerfile \
  --build-arg NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta \
  --build-arg NEXT_PUBLIC_WALLET_MODE=real \
  -t cryptopay/web:local .
```

Common frontend build args:
- `NEXT_PUBLIC_SOLANA_CLUSTER`
- `NEXT_PUBLIC_WALLET_MODE`
- `NEXT_PUBLIC_LANDING_USDC_ETB_RATE`
- `NEXT_PUBLIC_LANDING_USDT_ETB_RATE`
- `NEXT_PUBLIC_LANDING_FEE_USD`

## Cache Behavior (Local vs Production)

### Local simulation (`docker-compose.prod.sim.yml`)

Local-only cache settings live in the sim overlay:
- `BUILDKIT_INLINE_CACHE=1`
- `cache_from` on local image tags (`cryptopay/*:prod-sim`)

This improves rebuild speed for local Docker Compose workflows without changing production compose behavior.

### Production compose (`docker-compose.prod.yml`)

Production compose should not include local cache tuning. It references prebuilt images and stays environment-neutral.

### CI (`.github/workflows/ci.yml`)

CI builds use the same shared Dockerfiles and pass per-service build args through the matrix. CI cache is handled by `docker/build-push-action` (`type=gha`) rather than the local sim overlay.

## Performance Notes

The shared Dockerfiles are optimized for rebuild speed:
- `pnpm fetch` pre-populates the pnpm store
- `pnpm install --offline` runs from cached tarballs
- package manifests are copied before full source to avoid invalidating install layers on minor source edits
- `pnpm` store and metadata directories use BuildKit cache mounts

## Security Notes

Runtime images keep the existing hardening pattern:
- non-root user (`uid/gid 1001`)
- `tini` as entrypoint
- `npm` / `corepack` removed from runtime image
- multi-stage build copies only runtime output into final image

