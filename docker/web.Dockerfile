# ── Optimized multi-stage Dockerfile for Next.js frontend ──
# Build from repo root: docker build -f docker/web.Dockerfile -t cryptopay-web .
# Also available at: apps/web/Dockerfile

ARG NODE_VERSION=22

# ─── Stage 1: Install + build ───
FROM node:${NODE_VERSION}-alpine AS build

RUN npm i -g pnpm@9.15.5 && npm cache clean --force

WORKDIR /workspace

# Copy lockfile first for layer caching
COPY --link pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --link packages/ ./packages/
COPY --link services/ ./services/
COPY --link apps/ ./apps/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

# Build args for NEXT_PUBLIC_* env vars baked at build time
ARG NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
ARG NEXT_PUBLIC_WALLET_MODE=real
ARG NEXT_PUBLIC_LANDING_USDC_ETB_RATE=140
ARG NEXT_PUBLIC_LANDING_USDT_ETB_RATE=140
ARG NEXT_PUBLIC_LANDING_FEE_USD=1

ENV NEXT_PUBLIC_SOLANA_CLUSTER=${NEXT_PUBLIC_SOLANA_CLUSTER}
ENV NEXT_PUBLIC_WALLET_MODE=${NEXT_PUBLIC_WALLET_MODE}
ENV NEXT_PUBLIC_LANDING_USDC_ETB_RATE=${NEXT_PUBLIC_LANDING_USDC_ETB_RATE}
ENV NEXT_PUBLIC_LANDING_USDT_ETB_RATE=${NEXT_PUBLIC_LANDING_USDT_ETB_RATE}
ENV NEXT_PUBLIC_LANDING_FEE_USD=${NEXT_PUBLIC_LANDING_FEE_USD}

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @cryptopay/web build

# ─── Stage 2: Minimal production runner ───
FROM node:${NODE_VERSION}-alpine AS runner

LABEL org.opencontainers.image.title="cryptopay-web"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"

RUN apk add --no-cache tini \
    && addgroup -g 1001 -S cryptopay \
    && adduser -u 1001 -S -h /app -G cryptopay cryptopay \
    && npm uninstall -g npm corepack 2>/dev/null || true \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm /tmp/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Copy only the standalone output (self-contained Node.js server + deps)
COPY --link --from=build --chown=1001:1001 /workspace/apps/web/.next/standalone ./
COPY --link --from=build --chown=1001:1001 /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --link --from=build --chown=1001:1001 /workspace/apps/web/public ./apps/web/public

USER 1001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
