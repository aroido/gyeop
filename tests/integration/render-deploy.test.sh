#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
IMAGE="gyeop-render-deploy-check-$$"
CONTAINER="${IMAGE}-run"
INVITE_HEADERS=$(mktemp)
ME_BODY=$(mktemp)

secret() {
  node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
}

cleanup() {
  rm -f "$INVITE_HEADERS"
  rm -f "$ME_BODY"
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
  -e GYEOP_CONCEPT_PROFILE_ENABLED=false \
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

animation_result=$(curl --silent --output /dev/null --write-out '%{http_code} %{content_type}' --max-time 5 \
  "http://127.0.0.1:${port}/animations/gyeop-pack-opening.json")
animation_status=${animation_result%% *}
animation_content_type=${animation_result#* }

[[ "$animation_status" == 200 ]]
[[ "$animation_content_type" == application/json* ]]

invite_status=$(curl --silent --dump-header "$INVITE_HEADERS" --output /dev/null --write-out '%{http_code}' --max-time 5 \
  "http://127.0.0.1:${port}/i/not-valid")
invite_cache_control=$(awk 'tolower($1) == "cache-control:" { $1 = ""; sub(/^ /, ""); print }' "$INVITE_HEADERS" | tr -d '\r')

if [[ "$invite_status" != 200 || "$invite_cache_control" != *no-store* ]]; then
  echo "Invite cache contract failed: status=${invite_status} cache=${invite_cache_control}" >&2
  exit 1
fi

api_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
  -X DELETE "http://127.0.0.1:${port}/api/me/session" \
  -H 'Origin: https://gyeop.example' \
  -H 'Content-Type: application/json' \
  --data '{}')

[[ "$api_status" == 204 ]]

legacy_me_status=$(curl --silent --output "$ME_BODY" --write-out '%{http_code}' --max-time 5 \
  "http://127.0.0.1:${port}/me")
concept_api_status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
  "http://127.0.0.1:${port}/api/me/concept-profile")
if [[ "$legacy_me_status" != 200 ]]; then
  echo "Disabled concept /me failed: status=${legacy_me_status}" >&2
  exit 1
fi
if [[ "$concept_api_status" != 404 ]]; then
  echo "Disabled concept API failed: status=${concept_api_status}" >&2
  exit 1
fi
if grep -q '장면이 쌓여 보이는 결' "$ME_BODY"; then
  echo "Disabled concept UI leaked concept copy." >&2
  exit 1
fi

if docker run --rm \
  -e APP_URL=https://gyeop.example \
  -e NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-placeholder \
  -e SUPABASE_SECRET_KEY=sb_secret_placeholder \
  -e ORIGIN_PROXY_SECRET="$proxy_secret" \
  -e RATE_LIMIT_SECRET="$rate_limit_secret" \
  -e ACCOUNT_DELETE_REAUTH_KEYRING="{\"v1\":\"$delete_key\"}" \
  -e ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=v1 \
  -e GYEOP_CONCEPT_PROFILE_ENABLED=TRUE \
  "$IMAGE" >/dev/null 2>&1; then
  echo "Invalid concept feature flag unexpectedly started." >&2
  exit 1
fi

echo "Render deploy check passed: home=${home_status} animation=${animation_status} animation_type=${animation_content_type} invite=${invite_status} invite_cache=${invite_cache_control} api=${api_status} legacy_me=${legacy_me_status} concept_api=${concept_api_status} invalid_flag=rejected"
