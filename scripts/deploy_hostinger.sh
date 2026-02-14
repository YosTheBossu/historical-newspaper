#!/usr/bin/env bash
set -euo pipefail

# Usage (minimum):
#   REPO_URL=https://github.com/u/r.git HOSTINGER_HOST=76.13.145.150 ./scripts/deploy_hostinger.sh
# Optional:
#   HOSTINGER_USER=root
#   HOSTINGER_USERS="root yossi"   # fallback order when HOSTINGER_USER is not set
#   REMOTE_APP_DIR=/var/www/historical-newspaper
#   BRANCH=main

: "${HOSTINGER_HOST:?Missing HOSTINGER_HOST}"
: "${REPO_URL:?Missing REPO_URL}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/historical-newspaper}"
BRANCH="${BRANCH:-main}"
HOSTINGER_USERS="${HOSTINGER_USERS:-root yossi}"

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run from inside your local git repository" >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "Cannot detect current local branch" >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No git remote 'origin' found. Add it first:" >&2
  echo "  git remote add origin <github_repo_url>" >&2
  exit 1
fi

echo "[1/4] Pushing local branch '$current_branch' to origin/$BRANCH"
git push origin "$current_branch:$BRANCH"

select_user() {
  local candidates=()
  if [[ -n "${HOSTINGER_USER:-}" ]]; then
    candidates+=("$HOSTINGER_USER")
  else
    # shellcheck disable=SC2206
    candidates=($HOSTINGER_USERS)
  fi

  for u in "${candidates[@]}"; do
    echo "Trying SSH user: $u" >&2
    if ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "$u@$HOSTINGER_HOST" 'echo connected' >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

echo "[2/4] Resolving SSH user on ${HOSTINGER_HOST}"
if resolved_user="$(select_user)"; then
  echo "Resolved SSH user: $resolved_user"
else
  echo "Could not auto-resolve SSH user with key-based auth." >&2
  echo "Set HOSTINGER_USER explicitly and ensure your SSH key is installed on the server." >&2
  exit 1
fi

echo "[3/4] Deploying on ${resolved_user}@${HOSTINGER_HOST}:${REMOTE_APP_DIR}"
ssh -o StrictHostKeyChecking=accept-new "${resolved_user}@${HOSTINGER_HOST}" bash -s -- "$REMOTE_APP_DIR" "$REPO_URL" "$BRANCH" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"
REPO_URL="$2"
BRANCH="$3"

mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH" || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"

if [[ ! -f index.html ]]; then
  echo "Warning: index.html not found in $APP_DIR"
fi

echo "Server deploy completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
REMOTE

echo "[4/4] Done"
