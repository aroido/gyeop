import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ENVIRONMENT_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/;

function integer(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is outside the allowed range`);
  }
  return value;
}

export function validateHttpBoundaryInventory(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("HTTP boundary inventory must be an object");
  }
  const proxyUid = integer(input.proxyUid, "proxyUid", 1, 0xffff_ffff);
  if (!Array.isArray(input.environments) || input.environments.length < 1) {
    throw new Error("HTTP boundary inventory needs environments");
  }

  const names = new Set();
  const appUids = new Set();
  const ports = new Set();
  const environments = input.environments.map((environment) => {
    if (!environment || typeof environment !== "object") {
      throw new Error("HTTP boundary environment must be an object");
    }
    const name = environment.name;
    const hostname = environment.hostname;
    if (
      typeof name !== "string" ||
      !ENVIRONMENT_NAME.test(name) ||
      names.has(name)
    ) {
      throw new Error(
        "HTTP boundary environment name is invalid or duplicated",
      );
    }
    if (typeof hostname !== "string" || !HOSTNAME.test(hostname)) {
      throw new Error(`${name} hostname is invalid`);
    }
    const appUid = integer(
      environment.appUid,
      `${name}.appUid`,
      1,
      0xffff_ffff,
    );
    const port = integer(environment.port, `${name}.port`, 1024, 65_535);
    if (appUid === proxyUid || appUids.has(appUid)) {
      throw new Error(
        "App UIDs must be distinct from the shared proxy and each other",
      );
    }
    if (ports.has(port)) throw new Error("App ports must be distinct");
    names.add(name);
    appUids.add(appUid);
    ports.add(port);
    return Object.freeze({ name, hostname, appUid, port });
  });
  return Object.freeze({ proxyUid, environments: Object.freeze(environments) });
}

export function renderNftables(input) {
  const inventory = validateHttpBoundaryInventory(input);
  const rules = [];
  for (const environment of inventory.environments) {
    const allowed = `{ ${inventory.proxyUid}, ${environment.appUid} }`;
    rules.push(
      `    oifname "lo" ip daddr 127.0.0.1 tcp dport ${environment.port} meta skuid ${allowed} counter accept comment "gyeop-allow-${environment.name}-ipv4"`,
      `    oifname "lo" ip daddr 127.0.0.1 tcp dport ${environment.port} counter reject with tcp reset comment "gyeop-deny-${environment.name}-ipv4"`,
      `    oifname "lo" ip6 daddr ::1 tcp dport ${environment.port} meta skuid ${allowed} counter accept comment "gyeop-allow-${environment.name}-ipv6"`,
      `    oifname "lo" ip6 daddr ::1 tcp dport ${environment.port} counter reject with tcp reset comment "gyeop-deny-${environment.name}-ipv6"`,
    );
  }
  return [
    "table inet gyeop_http_boundary {",
    "  chain output {",
    "    type filter hook output priority filter; policy accept;",
    ...rules,
    "  }",
    "}",
    "",
  ].join("\n");
}

export function renderHaproxyBackend(input, environmentName) {
  const inventory = validateHttpBoundaryInventory(input);
  const environment = inventory.environments.find(
    (candidate) => candidate.name === environmentName,
  );
  if (!environment) throw new Error("Unknown HTTP boundary environment");
  return [
    `defaults gyeop_${environment.name}_http`,
    "  mode http",
    "  timeout client 30s",
    "  timeout connect 3s",
    "  timeout server 30s",
    "  timeout http-request 10s",
    "",
    `backend gyeop_${environment.name}`,
    "  mode http",
    "  acl declared_body_too_large req.hdr(content-length) -m int gt 65536",
    "  http-request return status 413 content-type application/json hdr Content-Security-Policy \"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'\" hdr Strict-Transport-Security max-age=31536000 hdr Referrer-Policy no-referrer hdr X-Content-Type-Options nosniff string '{\"code\":\"PAYLOAD_TOO_LARGE\",\"message\":\"요청 내용이 너무 큽니다.\"}' if declared_body_too_large",
    "  http-request del-header x-forwarded- -m beg",
    "  http-request del-header Forwarded",
    "  http-request del-header X-Real-IP",
    "  http-request del-header X-Gyeop-Origin-Verify",
    "  http-request set-header X-Forwarded-For %[src]",
    `  http-request set-header X-Forwarded-Host ${environment.hostname}`,
    "  http-request set-header X-Forwarded-Proto https",
    "  http-request set-header X-Forwarded-Port 443",
    "  http-request set-header X-Gyeop-Origin-Verify %[env(ORIGIN_PROXY_WRITER_SECRET)]",
    `  server app 127.0.0.1:${environment.port} check`,
    "",
  ].join("\n");
}

async function main(argv) {
  if (
    !["nftables", "haproxy"].includes(argv[0]) ||
    (argv[0] === "nftables" && argv.length !== 2) ||
    (argv[0] === "haproxy" && argv.length !== 3)
  ) {
    throw new Error(
      "usage: render-http-boundary-ops.mjs nftables <inventory.json> | haproxy <inventory.json> <environment>",
    );
  }
  const inventory = JSON.parse(await readFile(argv[1], "utf8"));
  process.stdout.write(
    argv[0] === "nftables"
      ? renderNftables(inventory)
      : renderHaproxyBackend(inventory, argv[2]),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
