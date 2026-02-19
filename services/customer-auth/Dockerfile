# CryptoPay Customer Auth
# Build from repo root: docker build -f services/customer-auth/Dockerfile -t cryptopay-customer-auth .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build
RUN npm i -g pnpm@9.15.5 && npm cache clean --force
WORKDIR /workspace
COPY --link pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY --link packages/ ./packages/
COPY --link services/ ./services/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline
RUN pnpm deploy --filter "@cryptopay/customer-auth" --prod /app

FROM node:${NODE_VERSION}-alpine
LABEL org.opencontainers.image.title="cryptopay-customer-auth"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"
RUN apk add --no-cache tini \
    && addgroup -g 1001 -S cryptopay \
    && adduser -u 1001 -S -h /app -G cryptopay cryptopay \
    && npm uninstall -g npm corepack 2>/dev/null || true \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm /tmp/*
WORKDIR /app
ENV NODE_ENV=production
COPY --link --from=build --chown=1001:1001 /app ./
USER 1001
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+(process.env.PORT||3005)+'/healthz').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/server.ts"]
