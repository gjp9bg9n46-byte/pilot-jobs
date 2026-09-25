#!/bin/bash
# Daily production Postgres backup — compressed pg_dump, keeps the last 7, stored
# OUTSIDE the Railway volume (on this Mac). Scheduled by launchd (see
# ~/Library/LaunchAgents/com.cockpithire.dbbackup.plist).
set -euo pipefail

BACKUP_DIR="/Users/mohamedalaa/pilot-jobs-backups"
ENV_FILE="/Users/mohamedalaa/pilot-jobs/backend/.env"
PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"
KEEP=7

mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" >> "$LOG"; }

DBURL=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | sed 's/^DATABASE_URL=//' | tr -d '"')
if [ -z "$DBURL" ]; then log "ERROR: DATABASE_URL not found in $ENV_FILE"; exit 1; fi

OUT="$BACKUP_DIR/prod-$(date +%Y-%m-%d-%H%M).dump"
if "$PG_DUMP" "$DBURL" -Fc --no-owner --no-privileges -f "$OUT" 2>>"$LOG"; then
  SZ=$(du -h "$OUT" | cut -f1)
  log "OK  wrote $OUT ($SZ)"
else
  log "ERROR: pg_dump failed"; rm -f "$OUT"; exit 1
fi

# Retain only the newest $KEEP dumps.
COUNT=$(ls -1 "$BACKUP_DIR"/prod-*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -1t "$BACKUP_DIR"/prod-*.dump | tail -n +$((KEEP + 1)) | while read -r old; do
    rm -f "$old"; log "pruned old backup $(basename "$old")"
  done
fi
log "done (retaining $KEEP; $COUNT total before prune)"
