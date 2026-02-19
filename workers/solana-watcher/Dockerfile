# CryptoPay Solana Watcher (Go)
# Build from repo root: docker build -f workers/solana-watcher/Dockerfile -t cryptopay-solana-watcher .

ARG GO_VERSION=1.22

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
COPY workers/solana-watcher/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /watcher ./cmd/main.go

FROM gcr.io/distroless/static-debian12:nonroot
LABEL org.opencontainers.image.title="cryptopay-solana-watcher"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"
COPY --from=build /watcher /watcher
USER nonroot:nonroot
ENTRYPOINT ["/watcher"]
