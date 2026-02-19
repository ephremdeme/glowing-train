#!/usr/bin/env bash
set -euo pipefail

docker compose up -d postgres redis

wait_healthy() {
  local container="$1"
  local timeout_seconds="${2:-120}"
  local elapsed=0

  while true; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      break
    fi

    if (( elapsed >= timeout_seconds )); then
      echo "Timed out waiting for $container to become healthy." >&2
      exit 1
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done
}

wait_healthy cryptopay-postgres 180
wait_healthy cryptopay-redis 120

echo "Postgres and Redis are ready."
