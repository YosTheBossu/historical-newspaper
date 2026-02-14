#!/usr/bin/env bash
set -euo pipefail

# Discover GitHub repo/account + Hostinger assets using API tokens.
# Usage:
#   GITHUB_TOKEN=... HOSTINGER_API_TOKEN=... ./scripts/discover_infra.sh

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "Missing GITHUB_TOKEN" >&2
  exit 1
fi
if [[ -z "${HOSTINGER_API_TOKEN:-}" ]]; then
  echo "Missing HOSTINGER_API_TOKEN" >&2
  exit 1
fi

OUT="infra-discovery-$(date +%Y%m%d-%H%M%S).txt"

echo "Infra discovery report" > "$OUT"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT"
echo >> "$OUT"

# GitHub account
echo "## GitHub account" >> "$OUT"
GH_USER_JSON="$(curl -fsSL -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user)"
python - <<'PY' "$GH_USER_JSON" >> "$OUT"
import json,sys
j=json.loads(sys.argv[1])
print(f"login: {j.get('login')}")
print(f"name: {j.get('name')}")
print(f"url: {j.get('html_url')}")
PY

echo >> "$OUT"
echo "## Candidate repositories (history/newspaper)" >> "$OUT"
GH_REPOS_JSON="$(curl -fsSL -H "Authorization: token $GITHUB_TOKEN" 'https://api.github.com/user/repos?per_page=100&sort=updated')"
python - <<'PY' "$GH_REPOS_JSON" >> "$OUT"
import json,sys,re
repos=json.loads(sys.argv[1])
pattern=re.compile(r'(history|historical|newspaper|archive|hebrew|israel)', re.I)
matches=[r for r in repos if pattern.search((r.get('name') or ''))]
if not matches:
    print('No direct name matches found in top 100 updated repos.')
for r in matches[:20]:
    print(f"- {r.get('full_name')} | {r.get('html_url')}")
print('\nTop 10 updated repos:')
for r in repos[:10]:
    print(f"- {r.get('full_name')} | {r.get('html_url')}")
PY

# Hostinger
echo >> "$OUT"
echo "## Hostinger API probes" >> "$OUT"
for ep in /v1 /v1/account /v1/accounts /v1/domains /v1/websites /v1/hosting; do
  echo "### GET $ep" >> "$OUT"
  HTTP_AND_BODY="$(curl -sS -w "\nHTTP_STATUS:%{http_code}\n" -H "Authorization: Bearer $HOSTINGER_API_TOKEN" "https://api.hostinger.com$ep" || true)"
  echo "$HTTP_AND_BODY" | sed -n '1,40p' >> "$OUT"
  echo >> "$OUT"
done

echo "Saved report: $OUT"
