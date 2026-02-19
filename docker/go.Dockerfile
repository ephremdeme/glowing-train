# ── Optimized multi-stage Dockerfile for Go blockchain watchers ──
# Usage: docker build -f docker/go.Dockerfile --build-arg WORKER_NAME=base-watcher -t cryptopay-base-watcher .
# Per-service Dockerfiles also available at workers/*/Dockerfile

ARG GO_VERSION=1.22

# ─── Stage 1: Build static binary ───
FROM golang:${GO_VERSION}-alpine AS build

ARG WORKER_NAME
RUN test -n "$WORKER_NAME" || (echo "ERROR: WORKER_NAME build arg is required" && exit 1)

WORKDIR /src
COPY workers/${WORKER_NAME}/ ./

# Static binary with stripped symbols + debug info
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -trimpath \
    -o /watcher \
    ./cmd/main.go

# ─── Stage 2: Distroless runtime (no shell, no pkg manager) ───
FROM gcr.io/distroless/static-debian12:nonroot

LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"
LABEL org.opencontainers.image.vendor="CryptoPay"

COPY --from=build /watcher /watcher

USER nonroot:nonroot

ENTRYPOINT ["/watcher"]
