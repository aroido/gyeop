import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const generated = spawnSync(
  "pnpm",
  ["exec", "supabase", "gen", "types", "typescript", "--local"],
  {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);
if (generated.status !== 0) {
  throw new Error("Supabase type generation failed");
}

const expected = await prettier.format(generated.stdout, {
  parser: "typescript",
});
const committed = readFileSync(
  path.join(ROOT, "lib/db/database.types.ts"),
  "utf8",
);
assert.equal(
  committed,
  expected,
  "lib/db/database.types.ts is stale; regenerate it from the reset local schema",
);
console.log("Supabase generated types match the local schema.");
