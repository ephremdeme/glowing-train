FROM golang:1.22-alpine AS builder
WORKDIR /src
RUN apk add --no-cache ca-certificates
COPY workers/base-watcher ./workers/base-watcher
RUN cd workers/base-watcher && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/base-watcher ./cmd/main.go

FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /out/base-watcher /usr/local/bin/base-watcher
ENTRYPOINT ["/usr/local/bin/base-watcher"]
