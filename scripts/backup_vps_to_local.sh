#!/usr/bin/env bash
set -euo pipefail

# Stream full VPS backup directly to local machine, with optional resume.
# Run THIS from your local machine.
#
# Usage:
#   VPS_HOST=76.13.145.150 ./scripts/backup_vps_to_local.sh
# Optional:
#   VPS_USERS="root yossi"
#   BACKUP_NAME=vps-full-backup-$(date +%F).tar.zst
#   COMPRESS_LEVEL=1
#   EXCLUDES="--exclude=/proc --exclude=/sys ..."

: "${VPS_HOST:?Missing VPS_HOST}"
VPS_USERS="${VPS_USERS:-root yossi}"
BACKUP_NAME="${BACKUP_NAME:-vps-full-backup-$(date +%F).tar.zst}"
COMPRESS_LEVEL="${COMPRESS_LEVEL:-1}"

EXCLUDES_DEFAULT="--exclude=/proc --exclude=/sys --exclude=/dev --exclude=/run --exclude=/tmp --exclude=/mnt --exclude=/media --exclude=/lost+found"
EXCLUDES="${EXCLUDES:-$EXCLUDES_DEFAULT}"

resolve_user() {
  local u
  for u in ${VPS_USERS}; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$u@$VPS_HOST" 'echo ok' >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi
if ! command -v dd >/dev/null 2>&1; then
  echo "dd is required" >&2
  exit 1
fi

if ! user="$(resolve_user)"; then
  echo "❌ Could not connect to $VPS_HOST with users: $VPS_USERS" >&2
  exit 1
fi

echo "✅ Using SSH user: $user"

tmp_cmd="sudo tar --one-file-system ${EXCLUDES} -I 'zstd -T0 -${COMPRESS_LEVEL}' -cpf - /"

if [[ -f "$BACKUP_NAME" ]]; then
  current_size="$(wc -c < "$BACKUP_NAME")"
  echo "⚠️ Existing backup file found: $BACKUP_NAME"
  echo "⚠️ Attempting resume from byte offset: $current_size"
  ssh -o StrictHostKeyChecking=accept-new "$user@$VPS_HOST" "$tmp_cmd" | dd of="$BACKUP_NAME" bs=4M seek="$((current_size / 4194304))" conv=notrunc status=progress
else
  echo "⬇️ Starting full backup stream to: $BACKUP_NAME"
  ssh -o StrictHostKeyChecking=accept-new "$user@$VPS_HOST" "$tmp_cmd" > "$BACKUP_NAME"
fi

echo "✅ Backup completed: $BACKUP_NAME"
if command -v zstd >/dev/null 2>&1; then
  echo "🔎 Verifying archive integrity with zstd -t ..."
  zstd -t "$BACKUP_NAME"
fi
