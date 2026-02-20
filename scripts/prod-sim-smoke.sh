#!/usr/bin/env sh
set -eu

# dash (/bin/sh on Ubuntu) may exit on unsupported shell options.
# Probe in a subshell first, then enable if supported.
if (set -o pipefail) >/dev/null 2>&1; then
  set -o pipefail
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.prod.local"
PROJECT_NAME="cryptopay-prod-sim"
TIMEOUT_SECONDS=120
DELAY_SECONDS=2
BUILD_ARGS="--build"
KEEP_RUNNING=0
RETRY_ATTEMPTS=3
RETRY_BASE_DELAY_SECONDS=5

usage() {
  cat <<'EOF'
Usage: scripts/prod-sim-smoke.sh [options]

Runs a production-like local simulation smoke test:
1) starts postgres/redis
2) runs db migration
3) starts all services
4) verifies readiness endpoints

Options:
  --env-file <path>     Env file to use (default: .env.prod.local)
  --project <name>      Docker compose project name (default: cryptopay-prod-sim)
  --timeout <seconds>   Max wait per endpoint (default: 120)
  --delay <seconds>     Poll delay per retry (default: 2)
  --no-build            Skip image builds when bringing services up
  --keep-running        Keep stack running after smoke check
  -h, --help            Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --project)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --delay)
      DELAY_SECONDS="$2"
      shift 2
      ;;
    --no-build)
      BUILD_ARGS=""
      shift
      ;;
    --keep-running)
      KEEP_RUNNING=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "${ROOT_DIR}/.env.prod.example" ]; then
    cp "${ROOT_DIR}/.env.prod.example" "$ENV_FILE"
    echo "Created $ENV_FILE from .env.prod.example"
  else
    echo "Missing env file: $ENV_FILE" >&2
    exit 1
  fi
fi

export APP_ENV_FILE="$ENV_FILE"

compose() {
  docker compose \
    --env-file "$ENV_FILE" \
    -p "$PROJECT_NAME" \
    -f "${ROOT_DIR}/docker-compose.prod.yml" \
    -f "${ROOT_DIR}/docker-compose.prod.sim.yml" \
    "$@"
}

compose_up() {
  if [ -n "$BUILD_ARGS" ]; then
    compose up -d --build "$@"
  else
    compose up -d "$@"
  fi
}

retry_cmd() {
  label="$1"
  shift
  attempt=1
  while :; do
    if "$@"; then
      return 0
    fi

    if [ "$attempt" -ge "$RETRY_ATTEMPTS" ]; then
      echo "FAIL ${label} after ${RETRY_ATTEMPTS} attempts" >&2
      return 1
    fi

    sleep_seconds=$((RETRY_BASE_DELAY_SECONDS * attempt + 1))
    echo "Retrying ${label} in ${sleep_seconds}s (attempt $((attempt + 1))/${RETRY_ATTEMPTS})..."
    sleep "$sleep_seconds"
    attempt=$((attempt + 1))
  done
}

cleanup() {
  if [ "$KEEP_RUNNING" -eq 1 ]; then
    return
  fi
  compose down > /dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for() {
  name="$1"
  url="$2"
  service="$3"
  attempts=$((TIMEOUT_SECONDS / DELAY_SECONDS))
  if [ "$attempts" -lt 1 ]; then
    attempts=1
  fi

  i=1
  while [ "$i" -le "$attempts" ]; do
    # Bound each readiness probe so one slow endpoint cannot hang the smoke script.
    if curl -fsS --connect-timeout 2 --max-time 5 "$url" > /dev/null 2>&1; then
      echo "OK  ${name}: ${url}"
      return 0
    fi
    i=$((i + 1))
    sleep "$DELAY_SECONDS"
  done

  echo "FAIL ${name}: ${url}" >&2
  compose logs --tail=120 "$service" >&2 || true
  return 1
}

echo "Bringing up dependencies..."
retry_cmd "dependencies startup" compose_up postgres redis

echo "Running migrations..."
compose run --rm --no-deps core-api node --experimental-strip-types /app/node_modules/@cryptopay/db/src/migrate.ts

echo "Bringing up full stack..."
retry_cmd "full stack startup" compose_up

echo "Checking readiness..."
wait_for "core-api" "http://localhost:13001/readyz" "core-api"
wait_for "customer-auth" "http://localhost:13005/readyz" "customer-auth"
wait_for "offshore-collector" "http://localhost:13002/readyz" "offshore-collector"
wait_for "payout-orchestrator" "http://localhost:13003/readyz" "payout-orchestrator"
wait_for "reconciliation-worker" "http://localhost:13004/readyz" "reconciliation-worker"
wait_for "admin-api" "http://localhost:13010/readyz" "admin-api"
wait_for "web" "http://localhost:18080/" "web"

echo "Smoke test passed."
if [ "$KEEP_RUNNING" -eq 1 ]; then
  echo "Stack left running (project: $PROJECT_NAME)."
else
  echo "Stack will be stopped."
fi
