#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="gyeop-http-boundary-host-test"
CONTAINER="gyeop-http-boundary-$RANDOM-$$"
NAMESPACE_HOLDER="$CONTAINER-namespace-holder"
TMP="$(mktemp -d)"
CURRENT="CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg"
# Test-only deterministic fixture. Never use this credential outside this container test.

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$NAMESPACE_HOLDER" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

cat >"$TMP/inventory.json" <<'JSON'
{
  "proxyUid": 2000,
  "environments": [
    { "name": "staging", "hostname": "gyeop.test", "appUid": 2001, "port": 3100 }
  ]
}
JSON

node "$ROOT/scripts/render-http-boundary-ops.mjs" nftables "$TMP/inventory.json" >"$TMP/http-boundary.nft"
node "$ROOT/scripts/render-http-boundary-ops.mjs" haproxy "$TMP/inventory.json" staging >"$TMP/backend.cfg"

cat >"$TMP/haproxy.cfg" <<'CFG'
global
  user gyeop-proxy
  group gyeop-proxy
CFG
cat "$TMP/backend.cfg" >>"$TMP/haproxy.cfg"
cat >>"$TMP/haproxy.cfg" <<'CFG'
frontend fixture
  bind 127.0.0.1:8443
  default_backend gyeop_staging
CFG

docker build -q -t "$IMAGE" "$ROOT/tests/fixtures/http-boundary-host" >/dev/null
docker create \
  --name "$CONTAINER" \
  --privileged \
  --cgroupns=private \
  --tmpfs /run \
  --tmpfs /run/lock \
  "$IMAGE" >/dev/null

docker start "$CONTAINER" >/dev/null
for _ in {1..60}; do
  if docker exec "$CONTAINER" systemctl is-system-running --wait >/dev/null 2>&1; then break; fi
  sleep 0.25
done

docker exec "$CONTAINER" groupadd --gid 2100 gyeop-origin
docker exec "$CONTAINER" groupadd --gid 2000 gyeop-proxy
docker exec "$CONTAINER" useradd --uid 2000 --gid 2000 --groups 2100 --no-create-home --shell /usr/sbin/nologin gyeop-proxy
docker exec "$CONTAINER" groupadd --gid 2001 gyeop-app
docker exec "$CONTAINER" useradd --uid 2001 --gid 2001 --groups 2100 --no-create-home --shell /usr/sbin/nologin gyeop-app
docker exec "$CONTAINER" groupadd --gid 2002 gyeop-denied
docker exec "$CONTAINER" useradd --uid 2002 --gid 2002 --no-create-home --shell /usr/sbin/nologin gyeop-denied

docker exec "$CONTAINER" mkdir -p /etc/gyeop/staging /usr/local/libexec /etc/systemd/system/gyeop-app@.service.d
docker cp "$TMP/http-boundary.nft" "$CONTAINER:/etc/gyeop/http-boundary.nft"
docker cp "$TMP/haproxy.cfg" "$CONTAINER:/etc/haproxy/gyeop.cfg"
docker cp "$ROOT/ops/http-boundary/haproxy-origin-wrapper" "$CONTAINER:/usr/local/libexec/haproxy-origin-wrapper"
docker cp "$ROOT/ops/http-boundary/gyeop-loopback-firewall-restore" "$CONTAINER:/usr/local/libexec/gyeop-loopback-firewall-restore"
docker cp "$ROOT/ops/http-boundary/gyeop-loopback-firewall-probe" "$CONTAINER:/usr/local/libexec/gyeop-loopback-firewall-probe"
docker cp "$ROOT/ops/http-boundary/gyeop-loopback-firewall.service" "$CONTAINER:/etc/systemd/system/gyeop-loopback-firewall.service"
docker cp "$ROOT/ops/http-boundary/gyeop-loopback-firewall-probe@.service" "$CONTAINER:/etc/systemd/system/gyeop-loopback-firewall-probe@.service"
docker cp "$ROOT/ops/http-boundary/gyeop-http-boundary@.target" "$CONTAINER:/etc/systemd/system/gyeop-http-boundary@.target"
docker cp "$ROOT/tests/fixtures/http-boundary-host/gyeop-app@.service" "$CONTAINER:/etc/systemd/system/gyeop-app@.service"
docker cp "$ROOT/tests/fixtures/http-boundary-host/gyeop-proxy.service" "$CONTAINER:/etc/systemd/system/gyeop-proxy.service"
docker cp "$ROOT/tests/fixtures/http-boundary-host/dummy-app-server.py" "$CONTAINER:/usr/local/libexec/gyeop-dummy-app"

printf '%s\n' "ORIGIN_PROXY_SECRET=$CURRENT" >"$TMP/origin.env"
docker cp "$TMP/origin.env" "$CONTAINER:/etc/gyeop/origin.env"
docker exec "$CONTAINER" sh -c "printf '%s\n' 'GYEOP_APP_PORT=3100' 'GYEOP_PROXY_UID=2000' 'GYEOP_APP_UID=2001' 'GYEOP_DENIED_UID=2002' >/etc/gyeop/staging/http-boundary.env"
docker exec "$CONTAINER" chmod 0640 /etc/gyeop/origin.env /etc/gyeop/http-boundary.nft /etc/gyeop/staging/http-boundary.env
docker exec "$CONTAINER" chown root:gyeop-origin /etc/gyeop/origin.env
docker exec "$CONTAINER" chmod 0755 /usr/local/libexec/haproxy-origin-wrapper /usr/local/libexec/gyeop-loopback-firewall-restore /usr/local/libexec/gyeop-loopback-firewall-probe /usr/local/libexec/gyeop-dummy-app
docker exec "$CONTAINER" systemctl daemon-reload
docker exec "$CONTAINER" systemctl enable gyeop-loopback-firewall.service gyeop-proxy.service gyeop-http-boundary@staging.target >/dev/null
docker stop -t 20 "$CONTAINER" >/dev/null

wait_for_boundary() {
  for _ in {1..120}; do
    if docker exec "$CONTAINER" systemctl is-active --quiet gyeop-http-boundary@staging.target gyeop-loopback-firewall-probe@staging.service gyeop-proxy.service >/dev/null 2>&1; then
      return
    fi
    sleep 0.25
  done
  docker exec "$CONTAINER" systemctl --no-pager --failed >&2 || true
  docker exec "$CONTAINER" journalctl --no-pager -u gyeop-loopback-firewall.service -u gyeop-loopback-firewall-probe@staging.service -u gyeop-app@staging.service -u gyeop-proxy.service >&2 || true
  return 1
}

boot_and_snapshot() {
  output=$1
  docker start "$CONTAINER" >/dev/null
  wait_for_boundary
  docker exec "$CONTAINER" sh -c '
    printf "%s\n" "$(readlink /proc/1/ns/net)"
    systemctl show -p InvocationID --value gyeop-loopback-firewall.service
    cat /run/gyeop-http-boundary/restored-network-namespace
    nft list chain inet gyeop_http_boundary output
  ' >"$output"
}

assert_proxy_guards() {
  before=$(docker exec "$CONTAINER" sha256sum /run/gyeop/capture.json | awk '{print $1}')
  docker exec -i "$CONTAINER" python3 - <<'PY'
import socket
import time


def exchange(payload):
    client = socket.create_connection(("127.0.0.1", 8443), timeout=2)
    client.settimeout(15)
    started = time.monotonic()
    client.sendall(payload)
    response = b""
    while True:
        chunk = client.recv(4096)
        if not chunk:
            break
        response += chunk
    client.close()
    return response, time.monotonic() - started


oversized, oversized_elapsed = exchange(
    b"POST /oversized HTTP/1.1\r\n"
    b"Host: gyeop.test\r\n"
    b"Content-Type: application/json\r\n"
    b"Content-Length: 65537\r\n"
    b"Connection: close\r\n\r\n"
)
head, body = oversized.split(b"\r\n\r\n", 1)
lines = head.split(b"\r\n")
if not lines[0].startswith(b"HTTP/1.1 413"):
    raise SystemExit(1)
headers = {}
for line in lines[1:]:
    name, value = line.split(b":", 1)
    headers[name.decode("ascii").lower()] = value.decode("utf-8").strip()
expected_headers = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    "strict-transport-security": "max-age=31536000",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
}
for name, value in expected_headers.items():
    if headers.get(name) != value:
        raise SystemExit(1)
if body != '{"code":"PAYLOAD_TOO_LARGE","message":"요청 내용이 너무 큽니다."}'.encode():
    raise SystemExit(1)
if oversized_elapsed >= 2:
    raise SystemExit(1)

slow, slow_elapsed = exchange(b"POST /slow HTTP/1.1\r\nHost: gyeop.test")
if not slow.startswith(b"HTTP/1.1 408"):
    raise SystemExit(1)
if not 8 <= slow_elapsed <= 15:
    raise SystemExit(1)
PY
  after=$(docker exec "$CONTAINER" sha256sum /run/gyeop/capture.json | awk '{print $1}')
  test "$before" = "$after"
}

assert_canonical_proxy() {
  if ! docker exec "$CONTAINER" curl -fsS \
  -H 'Forwarded: for=198.51.100.1' \
  -H 'X-Forwarded-For: 198.51.100.2' \
  -H 'X-Forwarded-For: 198.51.100.3' \
  -H 'X-Forwarded-Host: evil.example' \
  -H 'X-Forwarded-Proto: http' \
  -H 'X-Forwarded-Port: 80' \
  -H 'X-Forwarded-Prefix: /spoofed' \
  -H 'X-Real-IP: 198.51.100.4' \
  -H 'X-Gyeop-Origin-Verify: attacker' \
  http://127.0.0.1:8443/probe >/dev/null; then
  docker exec "$CONTAINER" systemctl --no-pager status gyeop-proxy.service >&2 || true
  docker exec "$CONTAINER" journalctl --no-pager -u gyeop-proxy.service >&2 || true
  docker exec "$CONTAINER" ss -lntp >&2 || true
  exit 1
  fi

  docker exec -i "$CONTAINER" python3 - <<'PY'
import json

with open("/run/gyeop/capture.json", encoding="utf-8") as source:
    headers = json.load(source)
with open("/etc/gyeop/origin.env", encoding="utf-8") as source:
    expected_secret = source.read().strip().split("=", 1)[1].split(".", 1)[0]

expected = {
    "x-forwarded-for": ["127.0.0.1"],
    "x-forwarded-host": ["gyeop.test"],
    "x-forwarded-proto": ["https"],
    "x-forwarded-port": ["443"],
    "x-gyeop-origin-verify": [expected_secret],
}
for name, value in expected.items():
    if headers.get(name) != value:
        raise SystemExit(1)
for forbidden in ["forwarded", "x-real-ip", "x-forwarded-prefix"]:
    if forbidden in headers:
        raise SystemExit(1)
PY
}

boot_and_snapshot "$TMP/first-boot"
assert_canonical_proxy
assert_proxy_guards

docker stop -t 20 "$CONTAINER" >/dev/null
docker run -d --name "$NAMESPACE_HOLDER" --network none "$IMAGE" /bin/sleep infinity >/dev/null
boot_and_snapshot "$TMP/second-boot"
assert_canonical_proxy
assert_proxy_guards

first_namespace=$(sed -n '1p' "$TMP/first-boot")
second_namespace=$(sed -n '1p' "$TMP/second-boot")
first_invocation=$(sed -n '2p' "$TMP/first-boot")
second_invocation=$(sed -n '2p' "$TMP/second-boot")
first_restored_namespace=$(sed -n '3p' "$TMP/first-boot")
second_restored_namespace=$(sed -n '3p' "$TMP/second-boot")

test -n "$first_namespace" && test -n "$second_namespace"
test "$first_namespace" != "$second_namespace"
test "$first_namespace" = "$first_restored_namespace"
test "$second_namespace" = "$second_restored_namespace"
test -n "$first_invocation" && test -n "$second_invocation"
test "$first_invocation" != "$second_invocation"
grep -q 'gyeop-deny-staging-ipv4' "$TMP/second-boot"
grep -q 'gyeop-deny-staging-ipv6' "$TMP/second-boot"

echo "HTTP boundary host integration passed."
