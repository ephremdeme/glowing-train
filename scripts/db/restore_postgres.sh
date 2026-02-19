#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_S3_URI:?BACKUP_S3_URI is required}"
: "${BACKUP_PATH:?BACKUP_PATH is required (e.g. postgres/20260219030000)}"
: "${RESTORE_DIR:?RESTORE_DIR is required}"

mkdir -p "$RESTORE_DIR"
aws s3 cp "$BACKUP_S3_URI/$BACKUP_PATH" "$RESTORE_DIR" --recursive

echo "Downloaded backup files to $RESTORE_DIR"
echo "Stop PostgreSQL, replace data directory with extracted base backup, then start PostgreSQL."
echo "After startup, validate with: select now(), count(*) from schema_migrations;"
