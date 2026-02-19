FROM node:22-alpine AS build
WORKDIR /workspace
RUN npm install -g pnpm@9.15.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages ./packages
COPY scripts ./scripts
COPY services/core-api ./services/core-api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cryptopay/db build
RUN pnpm --filter @cryptopay/core-api build
RUN pnpm deploy --filter @cryptopay/core-api --prod /out

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
EXPOSE 3001
CMD ["node", "dist/server.cjs"]
