#!/usr/bin/env bash
set -euo pipefail

# Bootstrap SSH key auth on a new server using password (one-time).
# Usage:
#   HOSTINGER_HOST=187.77.75.48 HOSTINGER_USER=root SSH_PASSWORD='***' ./scripts/bootstrap_ssh_key.sh

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${HOSTINGER_USER:?Missing HOSTINGER_USER}"
: "${SSH_PASSWORD:?Missing SSH_PASSWORD}"

if ! command -v sshpass >/dev/null 2>&1; then
  echo "❌ sshpass is required. Install it locally first (e.g. apt install sshpass / brew install hudochenkov/sshpass/sshpass)." >&2
  exit 1
fi

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [[ ! -f "$HOME/.ssh/id_ed25519.pub" ]]; then
  ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/id_ed25519"
fi

PUB_KEY="$(cat "$HOME/.ssh/id_ed25519.pub")"

sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=accept-new "$HOSTINGER_USER@$HOSTINGER_HOST" \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && grep -qxF '$PUB_KEY' ~/.ssh/authorized_keys || echo '$PUB_KEY' >> ~/.ssh/authorized_keys"

echo "✅ SSH key bootstrap completed for $HOSTINGER_USER@$HOSTINGER_HOST"
