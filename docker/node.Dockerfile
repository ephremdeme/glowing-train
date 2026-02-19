# ── Optimized multi-stage Dockerfile for Node.js Fastify services ──
# Usage: docker build -f docker/node.Dockerfile --build-arg SERVICE_NAME=core-api -t cryptopay-core-api .
# Works for: core-api, customer-auth, offshore-collector, payout-orchestrator, reconciliation-worker, admin-api
#
# Optimizations over naive approach:
#   • pnpm store cache mount — avoids re-downloading on rebuilds
#   • Two stages only (deps+deploy merged) — fewer layers, less duplication
#   • tsx installed into deployed output (not globally) — smaller, reproducible
#   • Runner has zero package managers (no npm, no pnpm) — smaller + secure
#   • COPY --link for parallel layer building
#   • Single RUN for user + apk to minimize layers
#   • node:22-alpine with npm/corepack stripped → ~50 MB base

ARG NODE_VERSION=22

# ─── Stage 1: Install deps + deploy isolated service ───
FROM node:${NODE_VERSION}-alpine AS build

ARG SERVICE_NAME
RUN test -n "$SERVICE_NAME" || (echo "ERROR: SERVICE_NAME build arg required" && exit 1)

# Install pnpm — only stage that needs it
RUN npm i -g pnpm@9.15.5 && npm cache clean --force

WORKDIR /workspace

# Copy lockfile + workspace config first for layer caching
COPY --link pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy only package.json files from all workspace packages (for dependency resolution)
# Then copy full source only for the packages we need
COPY --link packages/ ./packages/
COPY --link services/ ./services/

# Install with cache mount — shared across builds, survives rebuilds
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

# Deploy target service with production deps into /app
RUN pnpm deploy --filter "@cryptopay/${SERVICE_NAME}" --prod /app

# Add tsx into deployed node_modules (needed to run TypeScript at runtime)
WORKDIR /app
RUN npm init -y > /dev/null 2>&1 \
    && npm install --no-save tsx@4.19.2 --prefix /app 2>/dev/null \
    && rm -f package.json package-lock.json \
    && find /app/node_modules -name '*.md' -o -name '*.map' -o -name 'LICENSE*' -o -name 'CHANGELOG*' | head -2000 | xargs rm -f 2>/dev/null || true

# ─── Stage 2: Minimal production runner ───
FROM node:${NODE_VERSION}-alpine AS runner

# OCI labels for registry metadata
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"
LABEL org.opencontainers.image.vendor="CryptoPay"

# Single layer: security hardening + tini + non-root user
RUN apk add --no-cache tini \
    && delgroup ping 2>/dev/null || true \
    && addgroup -g 1001 -S cryptopay \
    && adduser -u 1001 -S -h /app -G cryptopay cryptopay \
    && npm uninstall -g npm corepack 2>/dev/null || true \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -rf /root/.npm /tmp/*

WORKDIR /app

ENV NODE_ENV=production

# Copy deployed service — link enables parallel layer building
COPY --link --from=build --chown=1001:1001 /app ./

USER 1001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/healthz').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/server.ts"]
