FROM node:22-alpine AS build
WORKDIR /workspace
RUN npm install -g pnpm@9.15.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages ./packages
COPY scripts ./scripts
COPY services/payout-orchestrator ./services/payout-orchestrator

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cryptopay/payout-orchestrator build
RUN pnpm deploy --filter @cryptopay/payout-orchestrator --prod /out

FROM alpine:3.21 AS runner
WORKDIR /app
RUN apk add --no-cache nodejs ca-certificates \
  && addgroup -S cryptopay \
  && adduser -S cryptopay -G cryptopay

ENV NODE_ENV=production \
    ENVIRONMENT=production

COPY --from=build --chown=cryptopay:cryptopay /out/ /app/
RUN rm -rf /app/src /app/test /app/tests \
  && find /app -type f \( -name '*.ts' -o -name '*.map' -o -name 'tsconfig*.json' -o -name '*.md' \) -delete

USER cryptopay
EXPOSE 3003
CMD ["node", "dist/server.cjs"]
