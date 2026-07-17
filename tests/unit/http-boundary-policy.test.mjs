import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { verifyHttpBoundarySources } from "../../scripts/verify-http-boundary.mjs";
import { securityHeaders } from "../../lib/http/security-headers.mjs";
import {
  renderNftables,
  validateHttpBoundaryInventory,
} from "../../scripts/render-http-boundary-ops.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);

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
    findings.some((finding) => finding.includes("must call withPublicRequest")),
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
