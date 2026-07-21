#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gyeop-supabase-readiness.XXXXXX")"
FAKE_BIN="$TEST_ROOT/bin"
COUNT_FILE="$TEST_ROOT/count"
mkdir -p "$FAKE_BIN"

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

cat >"$FAKE_BIN/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail

EXPECTED="exec supabase_db_gyeop pg_isready -U postgres -d postgres"
if [[ "$*" != "$EXPECTED" ]]; then
  echo "unexpected docker arguments: $*" >&2
  exit 64
fi

count=0
if [[ -f "$FAKE_DOCKER_COUNT_FILE" ]]; then
  count="$(<"$FAKE_DOCKER_COUNT_FILE")"
fi
count=$((count + 1))
printf '%s\n' "$count" >"$FAKE_DOCKER_COUNT_FILE"

if [[ "$FAKE_DOCKER_MODE" == "eventual" && "$count" -ge 3 ]]; then
  exit 0
fi
exit 1
FAKE_DOCKER
chmod +x "$FAKE_BIN/docker"

run_waiter() {
  PATH="$FAKE_BIN:$PATH" \
    FAKE_DOCKER_COUNT_FILE="$COUNT_FILE" \
    FAKE_DOCKER_MODE="$1" \
    GYEOP_SUPABASE_READY_ATTEMPTS=3 \
    GYEOP_SUPABASE_READY_INTERVAL_SECONDS=0 \
    "$ROOT/scripts/wait-for-supabase-db"
}

run_waiter eventual
test "$(<"$COUNT_FILE")" -eq 3

rm -f -- "$COUNT_FILE"
if run_waiter timeout >"$TEST_ROOT/timeout.out" 2>"$TEST_ROOT/timeout.err"; then
  echo "readiness timeout unexpectedly passed" >&2
  exit 1
fi
test "$(<"$COUNT_FILE")" -eq 3
grep -F "container=supabase_db_gyeop attempts=3" "$TEST_ROOT/timeout.err" >/dev/null

echo "Supabase readiness verification passed."
