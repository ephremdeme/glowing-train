FROM node:22-alpine AS deps
WORKDIR /workspace
RUN apk add --no-cache python3 make g++ linux-headers eudev-dev && npm install -g pnpm@9.15.5
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @cryptopay/web...

FROM deps AS builder
WORKDIR /workspace
ENV NODE_ENV=production
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web ./apps/web
RUN pnpm --filter @cryptopay/web build

FROM alpine:3.21 AS runner
WORKDIR /app
RUN apk add --no-cache nodejs ca-certificates \
  && addgroup -S cryptopay \
  && adduser -S cryptopay -G cryptopay
ENV NODE_ENV=production \
    ENVIRONMENT=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=cryptopay:cryptopay /workspace/apps/web/.next/standalone /app
COPY --from=builder --chown=cryptopay:cryptopay /workspace/apps/web/.next/static /app/apps/web/.next/static
RUN find /app -type f \( -name '*.md' -o -name '*.map' \) -delete

USER cryptopay
EXPOSE 3000
CMD ["sh", "-lc", "if [ -f /app/server.js ]; then exec node /app/server.js; else exec node /app/apps/web/server.js; fi"]
