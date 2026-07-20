#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
IMAGE="gyeop-render-deploy-check-$$"
CONTAINER="${IMAGE}-run"

secret() {
  node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
}

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

proxy_secret=$(secret)
rate_limit_secret=$(secret)
delete_key=$(secret)

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-placeholder \
  -t "$IMAGE" \
  "$ROOT"

docker run -d --name "$CONTAINER" -p 127.0.0.1::10000 \
  -e APP_URL=https://gyeop.example \
  -e NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-placeholder \
  -e SUPABASE_SECRET_KEY=sb_secret_placeholder \
  -e ORIGIN_PROXY_SECRET="$proxy_secret" \
  -e RATE_LIMIT_SECRET="$rate_limit_secret" \
  -e ACCOUNT_DELETE_REAUTH_KEYRING="{\"v1\":\"$delete_key\"}" \
  -e ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=v1 \
  "$IMAGE" >/dev/null

port=$(docker port "$CONTAINER" 10000/tcp | awk -F: '{print $NF}')
for _ in {1..30}; do
  home_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://127.0.0.1:${port}/" || true)
  [[ "$home_status" == 200 ]] && break
  sleep 1
done

if [[ "$home_status" != 200 ]]; then
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

api_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
  -X DELETE "http://127.0.0.1:${port}/api/me/session" \
  -H 'Origin: https://gyeop.example' \
  -H 'Content-Type: application/json' \
  --data '{}')

[[ "$api_status" == 204 ]]
echo "Render deploy check passed: home=${home_status} api=${api_status}"
