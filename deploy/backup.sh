#!/usr/bin/env bash
# Backs up one environment's database and sends it off the machine: pg_dump (by the app's own
# image, so its pg_dump matches) into data/backups/, then rclone to an S3-compatible bucket
# (Cloudflare R2), keeping 30 days there and 7 here. Run nightly by knightly-backup.timer.
#
#   /opt/knightly/backup.sh production      (with backup.env's RCLONE_CONFIG_OFFSITE_* set)
#
# Restore: download a .dump, then pg_restore --clean --if-exists --no-owner -d "$KNIGHTLY_DATABASE_URL" <file>
set -euo pipefail

env="${1:?usage: backup.sh <staging|production>}"
dir="/opt/knightly/$env"
cd "$dir"

docker compose run --rm --no-deps -T worker knightly backup --dir /data/backups --keep 7

if [[ -z "${RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID:-}" ]]; then
  echo "backup.env has no bucket credentials: the dump stays on this machine only." >&2
  exit 1
fi
rclone copy "$dir/data/backups" "offsite:${BACKUP_BUCKET:?}/$env" --include "knightly-*.dump"
rclone delete "offsite:${BACKUP_BUCKET}/$env" --min-age 30d --include "knightly-*.dump"
echo "Backed up $env to ${BACKUP_BUCKET}/$env"
