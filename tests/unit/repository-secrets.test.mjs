import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("keeps server secrets out of committed env and CI files", async () => {
  const [envExample, workflow] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
  ]);

  assert.match(envExample, /^ACCOUNT_DELETE_REAUTH_KEYRING=$/m);
  assert.match(envExample, /^ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=$/m);
  assert.match(envExample, /^SUPABASE_SECRET_KEY=$/m);
  assert.match(envExample, /^ORIGIN_PROXY_SECRET=$/m);
  assert.match(envExample, /^RATE_LIMIT_SECRET=$/m);
  assert.doesNotMatch(
    workflow,
    /(?:ACCOUNT_DELETE_REAUTH_(?:KEYRING|ACTIVE_VERSION)|SUPABASE_SECRET_KEY|ORIGIN_PROXY_SECRET|RATE_LIMIT_SECRET)\s*:/,
  );
});
