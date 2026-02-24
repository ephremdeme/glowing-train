# syntax=docker/dockerfile:1.7
# Shared multi-stage Dockerfile for the Next.js frontend.
# Build from repo root: docker build -f docker/web.Dockerfile -t cryptopay-web .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build

RUN npm i -g pnpm@9.15.5 && npm cache clean --force

WORKDIR /workspace

COPY --link pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm fetch --frozen-lockfile --prefer-offline --ignore-scripts

COPY --link packages/adapters/package.json ./packages/adapters/package.json
COPY --link packages/auth/package.json ./packages/auth/package.json
COPY --link packages/config/package.json ./packages/config/package.json
COPY --link packages/db/package.json ./packages/db/package.json
COPY --link packages/domain/package.json ./packages/domain/package.json
COPY --link packages/http/package.json ./packages/http/package.json
COPY --link packages/observability/package.json ./packages/observability/package.json
COPY --link packages/ops-cli/package.json ./packages/ops-cli/package.json
COPY --link packages/ops-jobs/package.json ./packages/ops-jobs/package.json
COPY --link packages/security/package.json ./packages/security/package.json
COPY --link apps/web/package.json ./apps/web/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --ignore-scripts --offline --filter @cryptopay/web...

COPY --link tsconfig.base.json ./
COPY --link packages/ ./packages/
COPY --link apps/web/ ./apps/web/

ARG NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
ARG NEXT_PUBLIC_SOLANA_PROGRAM_ID=
ARG NEXT_PUBLIC_SOLANA_USDT_MINT=
ARG NEXT_PUBLIC_SOLANA_USDC_MINT=
ARG NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA=
ARG NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA=
ARG NEXT_PUBLIC_WALLET_MODE=real
ARG NEXT_PUBLIC_LANDING_USDC_ETB_RATE=140
ARG NEXT_PUBLIC_LANDING_USDT_ETB_RATE=140
ARG NEXT_PUBLIC_LANDING_FEE_USD=1

ENV NEXT_PUBLIC_SOLANA_CLUSTER=${NEXT_PUBLIC_SOLANA_CLUSTER}
ENV NEXT_PUBLIC_SOLANA_PROGRAM_ID=${NEXT_PUBLIC_SOLANA_PROGRAM_ID}
ENV NEXT_PUBLIC_SOLANA_USDT_MINT=${NEXT_PUBLIC_SOLANA_USDT_MINT}
ENV NEXT_PUBLIC_SOLANA_USDC_MINT=${NEXT_PUBLIC_SOLANA_USDC_MINT}
ENV NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA=${NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA}
ENV NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA=${NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA}
ENV NEXT_PUBLIC_WALLET_MODE=${NEXT_PUBLIC_WALLET_MODE}
ENV NEXT_PUBLIC_LANDING_USDC_ETB_RATE=${NEXT_PUBLIC_LANDING_USDC_ETB_RATE}
ENV NEXT_PUBLIC_LANDING_USDT_ETB_RATE=${NEXT_PUBLIC_LANDING_USDT_ETB_RATE}
ENV NEXT_PUBLIC_LANDING_FEE_USD=${NEXT_PUBLIC_LANDING_FEE_USD}
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @cryptopay/web build

FROM node:${NODE_VERSION}-alpine AS runner

LABEL org.opencontainers.image.title="cryptopay-web"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"

RUN apk add --no-cache tini \
    && addgroup -g 1001 -S cryptopay \
    && adduser -u 1001 -S -h /app -G cryptopay cryptopay \
    && (npm uninstall -g npm corepack 2>/dev/null || true) \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm /tmp/*

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

COPY --link --from=build --chown=1001:1001 /workspace/apps/web/.next/standalone ./
COPY --link --from=build --chown=1001:1001 /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --link --from=build --chown=1001:1001 /workspace/apps/web/public ./apps/web/public

USER 1001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
