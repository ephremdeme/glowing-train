FROM golang:1.22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY workers/solana-watcher ./workers/solana-watcher
RUN cd workers/solana-watcher && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/solana-watcher ./cmd/main.go

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/solana-watcher /usr/local/bin/solana-watcher
ENTRYPOINT ["/usr/local/bin/solana-watcher"]
