import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("keeps account-delete values out of committed env and CI files", async () => {
  const [envExample, workflow] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
  ]);

  assert.match(envExample, /^ACCOUNT_DELETE_REAUTH_KEYRING=$/m);
  assert.match(envExample, /^ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION=$/m);
  assert.doesNotMatch(
    workflow,
    /ACCOUNT_DELETE_REAUTH_(?:KEYRING|ACTIVE_VERSION)\s*:/,
  );
});
