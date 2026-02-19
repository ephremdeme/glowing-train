# CryptoPay Base Watcher (Go)
# Build from repo root: docker build -f workers/base-watcher/Dockerfile -t cryptopay-base-watcher .

ARG GO_VERSION=1.22

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src
COPY workers/base-watcher/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /watcher ./cmd/main.go

FROM gcr.io/distroless/static-debian12:nonroot
LABEL org.opencontainers.image.title="cryptopay-base-watcher"
LABEL org.opencontainers.image.source="https://github.com/ephrem/CryptoPay"
COPY --from=build /watcher /watcher
USER nonroot:nonroot
ENTRYPOINT ["/watcher"]
