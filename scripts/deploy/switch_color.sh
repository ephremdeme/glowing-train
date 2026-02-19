#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --color <blue|green> --environment <staging|production>" >&2
  exit 1
}

COLOR=""
ENVIRONMENT_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --color)
      COLOR="${2:-}"
      shift 2
      ;;
    --environment)
      ENVIRONMENT_NAME="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$COLOR" && -n "$ENVIRONMENT_NAME" ]] || usage
[[ "$COLOR" == "blue" || "$COLOR" == "green" ]] || usage

if [[ "$COLOR" == "blue" ]]; then
  ETHIOPIA_API_UPSTREAM="http://10.0.11.10:3101"
  OFFSHORE_API_UPSTREAM="http://10.0.21.10:4102"
  WEB_UPSTREAM="http://10.0.11.10:3100"
else
  ETHIOPIA_API_UPSTREAM="http://10.0.11.10:3201"
  OFFSHORE_API_UPSTREAM="http://10.0.21.10:4202"
  WEB_UPSTREAM="http://10.0.11.10:3200"
fi

mkdir -p infra/edge
cat > "infra/edge/.env.${ENVIRONMENT_NAME}" <<EOV
ETHIOPIA_API_UPSTREAM=${ETHIOPIA_API_UPSTREAM}
OFFSHORE_API_UPSTREAM=${OFFSHORE_API_UPSTREAM}
WEB_UPSTREAM=${WEB_UPSTREAM}
EDGE_HOSTNAME=:80
EOV

echo "$COLOR" > "infra/edge/.active-color.${ENVIRONMENT_NAME}"

echo "Switched ${ENVIRONMENT_NAME} active color to ${COLOR}."
echo "Reload your edge Caddy service with env file infra/edge/.env.${ENVIRONMENT_NAME}."
