# syntax=docker/dockerfile:1.7
# Shared multi-stage Dockerfile for Node.js services in this monorepo.
# Usage:
#   docker build -f docker/node.Dockerfile \
#     --build-arg SERVICE_NAME=core-api \
#     --build-arg SERVICE_PORT=3001 \
#     -t cryptopay-core-api .
# Supports:
#   core-api, customer-auth, offshore-collector, payout-orchestrator,
#   reconciliation-worker, admin-api

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build

ARG SERVICE_NAME
ARG SERVICE_PORT=3001
RUN test -n "$SERVICE_NAME" || (echo "ERROR: SERVICE_NAME build arg required" && exit 1)

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
COPY --link services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/package.json

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --ignore-scripts --offline --filter @cryptopay/${SERVICE_NAME}...

COPY --link packages/ ./packages/
COPY --link services/${SERVICE_NAME}/ ./services/${SERVICE_NAME}/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=pnpm-metadata,target=/root/.cache/pnpm \
    pnpm deploy --filter "@cryptopay/${SERVICE_NAME}" --prod /app

FROM node:${NODE_VERSION}-alpine AS runner
ARG SERVICE_NAME
ARG SERVICE_PORT=3001

LABEL org.opencontainers.image.title="cryptopay-${SERVICE_NAME}"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"

RUN apk add --no-cache tini \
    && addgroup -g 1001 -S cryptopay \
    && adduser -u 1001 -S -h /app -G cryptopay cryptopay \
    && (npm uninstall -g npm corepack 2>/dev/null || true) \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm /tmp/*

WORKDIR /app

ENV NODE_ENV=production
ENV SERVICE_PORT=${SERVICE_PORT}
ENV PORT=${SERVICE_PORT}

COPY --link --from=build --chown=1001:1001 /app ./

USER 1001
EXPOSE ${SERVICE_PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const port=process.env.PORT||process.env.SERVICE_PORT||'3001'; fetch('http://127.0.0.1:'+port+'/healthz').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/server.ts"]
