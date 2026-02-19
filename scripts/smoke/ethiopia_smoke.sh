#!/usr/bin/env bash
set -euo pipefail

BASE_URL=""
OBSERVE_SECONDS="0"

usage() {
  echo "Usage: $0 --base-url <url> [--observe-seconds <seconds>]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --observe-seconds)
      OBSERVE_SECONDS="${2:-0}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$BASE_URL" ]] || usage

healthz="$(curl -fsS "${BASE_URL}/healthz")"
readyz="$(curl -fsS "${BASE_URL}/readyz")"
version="$(curl -fsS "${BASE_URL}/version")"

printf '%s\n' "$healthz" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
printf '%s\n' "$readyz" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
printf '%s\n' "$version" | grep -Eq '"releaseId"|"service"'

if (( OBSERVE_SECONDS > 0 )); then
  end_at=$((SECONDS + OBSERVE_SECONDS))
  while (( SECONDS < end_at )); do
    payload="$(curl -fsS "${BASE_URL}/readyz")"
    printf '%s\n' "$payload" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'
    sleep 10
  done
fi

echo "Ethiopia smoke checks passed for ${BASE_URL}."
