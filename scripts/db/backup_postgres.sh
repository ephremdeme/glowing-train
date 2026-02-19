#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${BACKUP_S3_URI:?BACKUP_S3_URI is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"

backup_dir="${BACKUP_DIR:-/tmp/pg-backup-$(date +%Y%m%d%H%M%S)}"
mkdir -p "$backup_dir"

pg_basebackup \
  --host="$POSTGRES_HOST" \
  --port="$POSTGRES_PORT" \
  --username="$POSTGRES_USER" \
  --pgdata="$backup_dir/base" \
  --format=tar \
  --gzip \
  --wal-method=stream

manifest_file="$backup_dir/manifest.txt"
{
  echo "timestamp=$(date -u +%FT%TZ)"
  echo "database=$POSTGRES_DB"
  echo "host=$POSTGRES_HOST"
} > "$manifest_file"

aws s3 cp "$backup_dir" "$BACKUP_S3_URI/postgres/$(date +%Y%m%d%H%M%S)/" --recursive

echo "Postgres backup uploaded to ${BACKUP_S3_URI}."
