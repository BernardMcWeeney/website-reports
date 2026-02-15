#!/usr/bin/env bash
set -euo pipefail

WORKER_NAME="${WORKER_NAME:-website-reports}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 25 ]]; then
  echo "Node 25+ is required. Current: $(node -v)" >&2
  exit 1
fi

if grep -q 'database_id = "REPLACE_WITH_D1_DATABASE_ID"' wrangler.toml; then
  echo "wrangler.toml still has placeholder D1 database_id. Set a real ID first." >&2
  echo "Run: npx wrangler d1 list" >&2
  exit 1
fi

require_env CLOUDFLARE_API_TOKEN
require_env CF_API_TOKEN
require_env CF_ACCOUNT_ID
require_env PSI_API_KEY

printf '%s' "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN --name "$WORKER_NAME"
printf '%s' "$CF_ACCOUNT_ID" | npx wrangler secret put CF_ACCOUNT_ID --name "$WORKER_NAME"
printf '%s' "$PSI_API_KEY" | npx wrangler secret put PSI_API_KEY --name "$WORKER_NAME"

if [[ -n "${RUN_TOKEN:-}" ]]; then
  printf '%s' "$RUN_TOKEN" | npx wrangler secret put RUN_TOKEN --name "$WORKER_NAME"
fi

npx wrangler d1 execute REPORTS_DB --remote --file=./migrations/0001_init.sql
npx wrangler deploy

echo "Deploy complete."
