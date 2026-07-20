#!/bin/sh

set -eu

: "${PORT:=10000}"
export PORT

if [ -z "${APP_URL:-}" ]; then
  : "${RENDER_EXTERNAL_URL:?APP_URL or RENDER_EXTERNAL_URL is required}"
  APP_URL=$RENDER_EXTERNAL_URL
  export APP_URL
fi

APP_HOST=$(node --input-type=module -e '
  const url = new URL(process.env.APP_URL);
  if (url.protocol !== "https:" || url.port) process.exit(1);
  process.stdout.write(url.hostname);
')

node scripts/validate-env.mjs

cat > /tmp/gyeop-haproxy.cfg <<EOF
global
  log stdout format raw local0

defaults
  mode http
  timeout client 30s
  timeout connect 3s
  timeout server 30s
  timeout http-request 10s

frontend public
  bind 0.0.0.0:${PORT}
  default_backend app

backend app
  acl declared_body_too_large req.hdr(content-length) -m int gt 65536
  http-request return status 413 content-type application/json hdr Content-Security-Policy "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'" hdr Strict-Transport-Security max-age=31536000 hdr Referrer-Policy no-referrer hdr X-Content-Type-Options nosniff string '{"code":"PAYLOAD_TOO_LARGE","message":"요청 내용이 너무 큽니다."}' if declared_body_too_large
  http-request del-header x-forwarded- -m beg
  http-request del-header Forwarded
  http-request del-header X-Real-IP
  http-request del-header X-Gyeop-Origin-Verify
  acl cloudflare_client_ip req.hdr(CF-Connecting-IP) -m ip
  http-request set-header X-Forwarded-For %[req.hdr(CF-Connecting-IP)] if cloudflare_client_ip
  http-request set-header X-Forwarded-For %[src] unless cloudflare_client_ip
  http-request del-header CF-Connecting-IP
  http-request set-header X-Forwarded-Host ${APP_HOST}
  http-request set-header X-Forwarded-Proto https
  http-request set-header X-Forwarded-Port 443
  http-request set-header X-Gyeop-Origin-Verify %[env(ORIGIN_PROXY_WRITER_SECRET)]
  server app 127.0.0.1:3100 check
EOF

HOSTNAME=127.0.0.1 PORT=3100 node server.js &
exec ./ops/haproxy-origin-wrapper -f /tmp/gyeop-haproxy.cfg
