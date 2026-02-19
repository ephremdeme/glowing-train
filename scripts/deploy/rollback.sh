#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --environment <staging|production>" >&2
  exit 1
}

ENVIRONMENT_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment)
      ENVIRONMENT_NAME="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$ENVIRONMENT_NAME" ]] || usage

STATE_FILE="infra/edge/.active-color.${ENVIRONMENT_NAME}"
[[ -f "$STATE_FILE" ]] || { echo "Missing active color file: $STATE_FILE" >&2; exit 1; }

CURRENT_COLOR="$(cat "$STATE_FILE")"
if [[ "$CURRENT_COLOR" == "blue" ]]; then
  TARGET_COLOR="green"
else
  TARGET_COLOR="blue"
fi

"$(dirname "$0")/switch_color.sh" --color "$TARGET_COLOR" --environment "$ENVIRONMENT_NAME"

echo "Rollback completed. Active color is now ${TARGET_COLOR}."
