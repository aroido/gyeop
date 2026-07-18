import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { verifyHttpBoundarySources } from "../../scripts/verify-http-boundary.mjs";
import { securityHeaders } from "../../lib/http/security-headers.mjs";
import {
  renderHaproxyBackend,
  renderNftables,
  validateHttpBoundaryInventory,
} from "../../scripts/render-http-boundary-ops.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

function packCatalogFindings({
  catalogBody = "",
  catalogCallback,
  extraRouteImports = "",
  extraFiles = {},
}) {
  const callback =
    catalogCallback ??
    `async () => {
      ${catalogBody}
    }`;
  return verifyHttpBoundarySources({
    "app/api/packs/[slug]/route.ts": `
      import { withPublicRequest } from "@/lib/http/request-boundary";
      import { runRateLimitedDomain } from "@/lib/http/rate-limit";
      import { readPublishedPack } from "@/lib/http/published-pack";
      ${extraRouteImports}
      export function GET(request: Request) {
        return withPublicRequest(request, {}, ({ networkKey, signal }) =>
          runRateLimitedDomain(
            {
              keyHash: networkKey,
              action: "pack_catalog_read",
              windowSeconds: 60,
              limit: 60,
              signal,
            },
            ${callback},
          ),
        );
      }
    `,
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
    "lib/http/rate-limit.ts": "export function runRateLimitedDomain() {}",
    "lib/http/published-pack.ts":
      'import { getPublishedPack } from "../db/internal-rpc"; export function readPublishedPack() { return getPublishedPack({}); }',
    "lib/db/internal-rpc.ts": "export function getPublishedPack() {}",
    ...extraFiles,
  });
}

test("the repository HTTP boundary policy passes", () => {
  assert.doesNotThrow(() =>
    execFileSync("node", ["scripts/verify-http-boundary.mjs"], {
      cwd: root,
      stdio: "pipe",
    }),
  );
});

test("accepts a public Route that uses the reviewed strict boundary", () => {
  assert.deepEqual(
    verifyHttpBoundarySources({
      "app/api/example/route.ts": `
        import { withPublicRequest } from "../../../lib/http/request-boundary";
        import { schema } from "../../../lib/example/schema";
        export function POST(request: Request) {
          return withPublicRequest(request, { schema, maximumBodyBytes: 1024 }, () => Response.json({ ok: true }));
        }
      `,
      "lib/example/schema.ts": `
        import { z } from "zod";
        import { strictJsonObject } from "../http/strict-json-schema";
        export const schema = strictJsonObject({ value: z.string() });
      `,
      "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
      "lib/http/strict-json-schema.ts": "export function strictJsonObject() {}",
    }),
    [],
  );
});

test("rejects direct body parsing, internal RPC access, loose schemas, casts, and helper bypasses", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/example/route.ts": `
      import { helper } from "../../../lib/example/helper";
      import { consumeRateLimit } from "../../../lib/db/internal-rpc";
      export async function POST(request: Request) {
        const body = await request.json();
        return helper(body as any);
      }
    `,
    "lib/example/helper.ts": `
      import { z } from "zod";
      export const schema = z.object({ value: z.string() }).passthrough();
      export function helper() { return new Response(); }
    `,
    "lib/db/internal-rpc.ts": "export function consumeRateLimit() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("must import the reviewed withPublicRequest"),
    ),
  );
  assert.ok(
    findings.some((finding) => finding.includes("raw internal boundary")),
  );
  assert.ok(
    findings.some((finding) => finding.includes("strictJsonObject only")),
  );
  assert.ok(
    findings.some((finding) => finding.includes("casts are forbidden")),
  );
  assert.ok(findings.some((finding) => finding.includes("raw HTTP parsing")));
});

test("rejects a lookalike boundary and transitive direct rate-limit access", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/example/route.ts": `
      import { withPublicRequest } from "../../../lib/example/fake-boundary";
      import { helper } from "../../../lib/example/helper";
      export function POST(request: Request) {
        return withPublicRequest(request, {}, () => helper());
      }
    `,
    "lib/example/fake-boundary.ts":
      "export function withPublicRequest(...args: unknown[]) { return args[2](); }",
    "lib/example/helper.ts": `
      import { consumeRateLimit } from "../db/internal-rpc";
      export function helper() { return consumeRateLimit({}); }
    `,
    "lib/db/internal-rpc.ts": "export function consumeRateLimit() {}",
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("must import the reviewed withPublicRequest"),
    ),
  );
  assert.ok(
    findings.some((finding) => finding.includes("raw internal boundary")),
  );
});

test("requires the published pack RPC behind the fixed catalog limiter", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/packs/[slug]/route.ts": `
      import { withPublicRequest } from "@/lib/http/request-boundary";
      import { readPublishedPack } from "@/lib/http/published-pack";
      export function GET(request: Request) {
        return withPublicRequest(request, {}, () => readPublishedPack("old-friend"));
      }
    `,
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
    "lib/http/published-pack.ts":
      'import { getPublishedPack } from "../db/internal-rpc"; export function readPublishedPack() { return getPublishedPack({}); }',
    "lib/db/internal-rpc.ts": "export function getPublishedPack() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("rejects an eager pack read disguised as a deferred limiter callback", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/packs/[slug]/route.ts": `
      import { withPublicRequest } from "@/lib/http/request-boundary";
      import { runRateLimitedDomain } from "@/lib/http/rate-limit";
      import { readPublishedPack } from "@/lib/http/published-pack";
      export function GET(request: Request) {
        return withPublicRequest(request, {}, ({ networkKey, signal }) =>
          runRateLimitedDomain(
            {
              keyHash: networkKey,
              action: "pack_catalog_read",
              windowSeconds: 60,
              limit: 60,
              signal,
            },
            (readPublishedPack("old-friend", signal), async () => Response.json({ ok: true })),
          ),
        );
      }
    `,
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
    "lib/http/rate-limit.ts": "export function runRateLimitedDomain() {}",
    "lib/http/published-pack.ts":
      'import { getPublishedPack } from "../db/internal-rpc"; export function readPublishedPack() { return getPublishedPack({}); }',
    "lib/db/internal-rpc.ts": "export function getPublishedPack() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("rejects a second pack read through a namespace import", () => {
  const findings = packCatalogFindings({
    extraRouteImports:
      'import * as packAdapter from "@/lib/http/published-pack";',
    catalogBody: `
      await packAdapter.readPublishedPack("old-friend", signal);
      await readPublishedPack("old-friend", signal);
      return Response.json({ ok: true });
    `,
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("rejects a second pack read through a dynamic adapter load", () => {
  const findings = packCatalogFindings({
    catalogBody: `
      const packAdapter = await import("@/lib/http/published-pack");
      await packAdapter.readPublishedPack("old-friend", signal);
      await readPublishedPack("old-friend", signal);
      return Response.json({ ok: true });
    `,
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("rejects a syntactically single pack read inside a repeated branch", () => {
  const findings = packCatalogFindings({
    catalogBody: `
      for (const slug of ["old-friend", "old-friend"]) {
        await readPublishedPack(slug, signal);
      }
      return Response.json({ ok: true });
    `,
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("rejects a named limiter callback that can recursively read the pack", () => {
  const findings = packCatalogFindings({
    catalogCallback: `async function loadAgain() {
      const pack = await readPublishedPack("old-friend", signal);
      if (!pack) return loadAgain();
      return Response.json(pack);
    }`,
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

function ownerRouteFiles(routePath, routeSource) {
  return {
    [routePath]: routeSource,
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
    "lib/http/rate-limit.ts": "export function runRateLimitedDomain() {}",
    "lib/http/owner-play.ts": `
      export function createOwnerPlayResponse() {}
      export function resumeOwnerPlayResponse() {}
      export function readOwnerPlayResponse() {}
      export function saveOwnerAnswerResponse() {}
      export function completeOwnerPlayResponse() {}
      export function revokeOwnerPlayResponse() {}
      export function ownerNotFoundResponse() {}
    `,
    "lib/owner-play/owner-play-session-core.mjs":
      "export function parseOwnerCookieHeader() {}",
  };
}

test("accepts the reviewed create/resume owner branch order", () => {
  assert.deepEqual(
    verifyHttpBoundarySources(
      ownerRouteFiles(
        "app/api/plays/route.ts",
        `
          import { withPublicRequest } from "../../../lib/http/request-boundary";
          import { runRateLimitedDomain } from "../../../lib/http/rate-limit";
          import { createOwnerPlayResponse, ownerNotFoundResponse, resumeOwnerPlayResponse } from "../../../lib/http/owner-play";
          import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";
          export function POST(request) {
            return withPublicRequest(request, {}, ({ networkKey, signal }) => {
              const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
              if (cookie.outcome === "absent") return createOwnerPlayResponse();
              if (cookie.outcome === "malformed") return ownerNotFoundResponse();
              return runRateLimitedDomain({ keyHash: networkKey, action: "owner_play_access", windowSeconds: 600, limit: 120, signal }, () => resumeOwnerPlayResponse());
            });
          }
        `,
      ),
    ),
    [],
  );
});

test("rejects owner resume before cookie branch selection and repeated create calls", () => {
  const reversed = verifyHttpBoundarySources(
    ownerRouteFiles(
      "app/api/plays/route.ts",
      `
        import { withPublicRequest } from "../../../lib/http/request-boundary";
        import { runRateLimitedDomain } from "../../../lib/http/rate-limit";
        import { createOwnerPlayResponse, resumeOwnerPlayResponse } from "../../../lib/http/owner-play";
        import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";
        export function POST(request) {
          return withPublicRequest(request, {}, ({ networkKey, signal }) =>
            runRateLimitedDomain({ keyHash: networkKey, action: "owner_play_access", windowSeconds: 600, limit: 120, signal }, () => {
              const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
              createOwnerPlayResponse();
              return resumeOwnerPlayResponse(cookie);
            })
          );
        }
      `,
    ),
  );
  assert.ok(
    reversed.some((finding) =>
      finding.includes("owner capability branch order"),
    ),
  );

  const repeated = verifyHttpBoundarySources(
    ownerRouteFiles(
      "app/api/plays/route.ts",
      `
        import { withPublicRequest } from "../../../lib/http/request-boundary";
        import { runRateLimitedDomain } from "../../../lib/http/rate-limit";
        import { createOwnerPlayResponse, resumeOwnerPlayResponse } from "../../../lib/http/owner-play";
        import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";
        export function POST(request) {
          return withPublicRequest(request, {}, ({ networkKey, signal }) => {
            const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
            for (const value of [1, 2]) createOwnerPlayResponse(value);
            return runRateLimitedDomain({ keyHash: networkKey, action: "owner_play_access", windowSeconds: 600, limit: 120, signal }, () => resumeOwnerPlayResponse(cookie));
          });
        }
      `,
    ),
  );
  assert.ok(
    repeated.some((finding) =>
      finding.includes("owner capability branch order"),
    ),
  );
});

test("requires logout to parse then revoke without an external limiter", () => {
  const findings = verifyHttpBoundarySources(
    ownerRouteFiles(
      "app/api/me/session/route.ts",
      `
        import { withPublicRequest } from "../../../../lib/http/request-boundary";
        import { runRateLimitedDomain } from "../../../../lib/http/rate-limit";
        import { revokeOwnerPlayResponse } from "../../../../lib/http/owner-play";
        import { parseOwnerCookieHeader } from "../../../../lib/owner-play/owner-play-session-core.mjs";
        export function DELETE(request) {
          return withPublicRequest(request, {}, ({ networkKey, signal }) => {
            const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
            return runRateLimitedDomain({ keyHash: networkKey, action: "owner_play_access", windowSeconds: 600, limit: 120, signal }, () => revokeOwnerPlayResponse(cookie));
          });
        }
      `,
    ),
  );
  assert.ok(
    findings.some((finding) =>
      finding.includes("owner capability branch order"),
    ),
  );
});

test("rejects an additional pack read hidden in a reachable helper", () => {
  const findings = packCatalogFindings({
    extraRouteImports: 'import { readAgain } from "@/lib/example/read-again";',
    catalogBody: `
      await readPublishedPack("old-friend", signal);
      await readAgain(signal);
      return Response.json({ ok: true });
    `,
    extraFiles: {
      "lib/example/read-again.ts": `
        import { readPublishedPack } from "../http/published-pack";
        export function readAgain(signal: AbortSignal) {
          return readPublishedPack("old-friend", signal);
        }
      `,
    },
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("fixed pack_catalog_read rate limit"),
    ),
  );
});

test("resolves root aliases before checking transitive internal access", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/example/route.js": `
      import { withPublicRequest } from "@/lib/http/request-boundary";
      import { helper } from "@/lib/example/helper";
      export function POST(request) {
        return withPublicRequest(request, {}, () => helper());
      }
    `,
    "lib/example/helper.ts": `
      import { consumeRateLimit } from "@//lib/db/internal-rpc.jsx";
      export function helper() { return consumeRateLimit({}); }
      export function loadWithAttributes() {
        return import("@/lib/db/internal-rpc.js", { with: {} });
      }
      export function loadUnknown(name: string) { return import(name); }
    `,
    "lib/db/internal-rpc.ts": "export function consumeRateLimit() {}",
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
  });
  assert.equal(
    findings.some((finding) =>
      finding.includes("must import the reviewed withPublicRequest"),
    ),
    false,
  );
  assert.ok(
    findings.filter((finding) => finding.includes("raw internal boundary"))
      .length >= 2,
  );
  assert.ok(
    findings.some((finding) => finding.includes("non-literal module load")),
  );
});

test("requires every public handler to return the reviewed boundary directly", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/example/route.ts": `
      import { withPublicRequest } from "../../../lib/http/request-boundary";
      import { mutate } from "../../../lib/example/domain";
      export async function POST(request: Request) {
        await mutate();
        return withPublicRequest(request, {}, () => new Response());
      }
      export function PUT(withPublicRequest: (...args: unknown[]) => Response) {
        return withPublicRequest(new Request("http://local"), {}, () => new Response());
      }
      export function DELETE(request: Request) {
        return withPublicRequest(new Request(request.url), {}, () => new Response());
      }
      export function OPTIONS(request: Request) {
        return withPublicRequest(request, {}, mutate());
      }
      export function PATCH(request: Request) {
        return withPublicRequest(request, mutate(), () => new Response());
      }
    `,
    "lib/example/domain.ts": "export async function mutate() {}",
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes(
        "exported POST must directly return the reviewed withPublicRequest",
      ),
    ),
  );
  assert.ok(
    findings.some((finding) =>
      finding.includes(
        "exported PUT must directly return the reviewed withPublicRequest",
      ),
    ),
  );
  assert.ok(
    findings.some((finding) =>
      finding.includes(
        "exported DELETE must directly return the reviewed withPublicRequest",
      ),
    ),
  );
  for (const method of ["OPTIONS", "PATCH"]) {
    assert.ok(
      findings.some((finding) =>
        finding.includes(
          `exported ${method} must directly return the reviewed withPublicRequest`,
        ),
      ),
    );
  }
});

test("rejects the public request boundary from cron routes", () => {
  const findings = verifyHttpBoundarySources({
    "app/api/internal/cron/example/route.js": `
      import { withPublicRequest } from "@//lib/http/request-boundary.jsx";
      const loadBoundary = () => import("@/lib/http/" + "request-boundary.js");
      export function POST(request) {
        return withPublicRequest(request, {}, () => new Response());
      }
    `,
    "lib/http/request-boundary.ts": "export function withPublicRequest() {}",
  });
  assert.ok(
    findings.some((finding) =>
      finding.includes("cron Route cannot use the public request boundary"),
    ),
  );
  assert.ok(
    findings.some((finding) =>
      finding.includes("cron Route cannot use a non-literal module load"),
    ),
  );
});

test("allows one shared proxy UID but rejects unsafe app UID and port inventories", () => {
  const inventory = {
    proxyUid: 2000,
    environments: [
      {
        name: "staging",
        hostname: "staging.gyeop.test",
        appUid: 2001,
        port: 3100,
      },
      { name: "production", hostname: "gyeop.test", appUid: 2002, port: 3200 },
    ],
  };
  assert.equal(validateHttpBoundaryInventory(inventory).proxyUid, 2000);
  const rules = renderNftables(inventory);
  assert.match(rules, /meta skuid \{ 2000, 2001 \}/);
  assert.match(rules, /meta skuid \{ 2000, 2002 \}/);

  assert.throws(
    () =>
      validateHttpBoundaryInventory({
        ...inventory,
        environments: [
          inventory.environments[0],
          { ...inventory.environments[1], appUid: 2001 },
        ],
      }),
    /App UIDs/,
  );
  assert.throws(
    () =>
      validateHttpBoundaryInventory({
        ...inventory,
        environments: [
          inventory.environments[0],
          { ...inventory.environments[1], port: 3100 },
        ],
      }),
    /ports/,
  );

  const haproxy = renderHaproxyBackend(inventory, "staging");
  assert.match(haproxy, /timeout http-request 10s/);
  assert.match(
    haproxy,
    /acl declared_body_too_large req\.hdr\(content-length\) -m int gt 65536/,
  );
  assert.match(haproxy, /http-request return status 413/);
});

test("keeps unsafe-eval out of production while allowing the Next development runtime", () => {
  const production = Object.fromEntries(
    securityHeaders({ NODE_ENV: "production" }).map(({ key, value }) => [
      key,
      value,
    ]),
  );
  const development = Object.fromEntries(
    securityHeaders({ NODE_ENV: "development" }).map(({ key, value }) => [
      key,
      value,
    ]),
  );
  assert.doesNotMatch(production["Content-Security-Policy"], /unsafe-eval/);
  assert.match(development["Content-Security-Policy"], /unsafe-eval/);
});
