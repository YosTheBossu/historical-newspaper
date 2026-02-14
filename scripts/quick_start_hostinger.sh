#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "========================================="
echo "הקמה מהירה ל-Hostinger (3 שאלות)"
echo "========================================="
echo

read -r -p "IP של השרת החדש (לדוגמה 187.77.75.48): " HOSTINGER_HOST
read -r -p "כתובת GitHub מלאה של הריפו: " REPO_URL
read -r -p "סיסמת SSH זמנית (אם התחברות במפתח בלבד - השאר ריק): " SSH_PASSWORD

HOSTINGER_USERS="root yossi"
HOSTINGER_USER="root"
BRANCH="main"
REMOTE_APP_DIR="/var/www/historical-newspaper"
APP_PORT="8080"

export HOSTINGER_HOST REPO_URL HOSTINGER_USERS HOSTINGER_USER BRANCH REMOTE_APP_DIR APP_PORT

if [[ -n "${SSH_PASSWORD}" ]]; then
  export SSH_PASSWORD
fi

echo
echo "מתחיל הקמה אוטומטית..."
"$ROOT_DIR/scripts/step_by_step_setup.sh"

echo
echo "✅ הסתיים. אם הכל עבר בהצלחה, אפשר לבדוק אתר ב:"
echo "http://${HOSTINGER_HOST}:${APP_PORT}"
