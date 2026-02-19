#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 --domain <ethiopia|offshore> --color <blue|green> --environment <local|staging|production> [--image-tag <tag>]" >&2
  exit 1
}

DOMAIN=""
COLOR=""
ENVIRONMENT_NAME=""
IMAGE_TAG="local-opt3"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --color)
      COLOR="${2:-}"
      shift 2
      ;;
    --environment)
      ENVIRONMENT_NAME="${2:-}"
      shift 2
      ;;
    --image-tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$DOMAIN" && -n "$COLOR" && -n "$ENVIRONMENT_NAME" ]] || usage
[[ "$DOMAIN" == "ethiopia" || "$DOMAIN" == "offshore" ]] || usage
[[ "$COLOR" == "blue" || "$COLOR" == "green" ]] || usage

COMPOSE_FILE="infra/compose/${DOMAIN}.${COLOR}.yml"
[[ -f "$COMPOSE_FILE" ]] || { echo "Missing compose file: $COMPOSE_FILE" >&2; exit 1; }

if [[ -z "${IMAGE_REGISTRY:-}" ]]; then
  if [[ "$IMAGE_TAG" == local-* ]]; then
    IMAGE_REGISTRY="cryptopay"
  else
    IMAGE_REGISTRY="ghcr.io/cryptopay"
  fi
fi

if [[ -z "${SKIP_PULL:-}" ]]; then
  if [[ "$IMAGE_TAG" == local-* ]]; then
    SKIP_PULL="true"
  else
    SKIP_PULL="false"
  fi
fi

export IMAGE_TAG
export IMAGE_REGISTRY
export ENVIRONMENT="$ENVIRONMENT_NAME"
export DEPLOY_COLOR="$COLOR"
export RELEASE_ID="${RELEASE_ID:-${ENVIRONMENT_NAME}-$(date +%Y%m%d%H%M%S)}"
export GIT_SHA="${GIT_SHA:-unknown}"

if [[ "$SKIP_PULL" == "true" ]]; then
  echo "Skipping image pull for ${DOMAIN}/${COLOR} (IMAGE_TAG=${IMAGE_TAG}, IMAGE_REGISTRY=${IMAGE_REGISTRY})."
else
  echo "Pulling images for ${DOMAIN}/${COLOR} from ${IMAGE_REGISTRY} with tag ${IMAGE_TAG}..."
  docker compose -f "$COMPOSE_FILE" pull
fi

if [[ "$DOMAIN" == "ethiopia" ]]; then
  echo "Running DB migration preflight for ${DOMAIN}/${COLOR}..."
  docker compose -f "$COMPOSE_FILE" run --rm core-api node ./node_modules/@cryptopay/db/dist/migrate.cjs
fi

echo "Starting ${DOMAIN}/${COLOR} stack..."
UP_FLAGS=(-d --remove-orphans)
if [[ "$IMAGE_TAG" == local-* ]]; then
  UP_FLAGS+=(--force-recreate)
fi
docker compose -f "$COMPOSE_FILE" up "${UP_FLAGS[@]}"

echo "Verifying service readiness endpoints..."
if [[ "$DOMAIN" == "ethiopia" ]]; then
  curl -fsS "http://127.0.0.1:$([[ "$COLOR" == "blue" ]] && echo 3101 || echo 3201)/readyz" >/dev/null
  curl -fsS "http://127.0.0.1:$([[ "$COLOR" == "blue" ]] && echo 3100 || echo 3200)/" >/dev/null || true
else
  curl -fsS "http://127.0.0.1:$([[ "$COLOR" == "blue" ]] && echo 4102 || echo 4202)/readyz" >/dev/null
fi

echo "Deployment finished: domain=${DOMAIN} color=${COLOR} image_registry=${IMAGE_REGISTRY} image_tag=${IMAGE_TAG}"
