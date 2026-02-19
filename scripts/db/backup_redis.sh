#!/usr/bin/env bash
set -euo pipefail

: "${REDIS_HOST:?REDIS_HOST is required}"
: "${REDIS_PORT:=6379}"
: "${BACKUP_S3_URI:?BACKUP_S3_URI is required}"

backup_dir="${BACKUP_DIR:-/tmp/redis-backup-$(date +%Y%m%d%H%M%S)}"
mkdir -p "$backup_dir"

redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$backup_dir/dump.rdb"

aws s3 cp "$backup_dir/dump.rdb" "$BACKUP_S3_URI/redis/$(date +%Y%m%d%H%M%S)-dump.rdb"

echo "Redis backup uploaded to ${BACKUP_S3_URI}."
