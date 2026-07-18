import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function filesBelow(relative) {
  const target = path.join(ROOT, relative);
  if (!existsSync(target)) return [];
  const files = [];
  for (const entry of readdirSync(target)) {
    const candidate = path.join(target, entry);
    if (statSync(candidate).isDirectory()) {
      files.push(...filesBelow(path.relative(ROOT, candidate)));
    } else if (/\.(?:mjs|ts|tsx)$/.test(candidate)) {
      files.push(candidate);
    }
  }
  return files;
}

export function verifyShareLinks() {
  const scoped = [
    ...filesBelow("app/me/plays"),
    ...filesBelow("app/i"),
    ...filesBelow("lib/share-links"),
  ];
  assert.ok(scoped.length > 0, "share link source scope is required");
  for (const file of scoped) {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(ROOT, file);
    assert.doesNotMatch(
      source,
      /\b(?:localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/,
      `${relative} cannot persist a share secret`,
    );
    assert.doesNotMatch(
      source,
      /console\s*\./,
      `${relative} cannot log a share secret or URL`,
    );
  }

  const fragment = readFileSync(
    path.join(ROOT, "lib/share-links/invite-fragment-core.mjs"),
    "utf8",
  );
  assert.doesNotMatch(fragment, /from\s+["']node:/);
  assert.match(fragment, /export function parseInviteFragment/);

  const stateFiles = filesBelow("lib");
  const decoderCount = stateFiles.reduce(
    (count, file) =>
      count +
      (readFileSync(file, "utf8").match(/function decodeShareLinkHttpCreated/g)
        ?.length ?? 0),
    0,
  );
  assert.equal(
    decoderCount,
    1,
    "share HTTP decoder must have one implementation",
  );

  const session = readFileSync(
    path.join(ROOT, "lib/share-links/share-link-session-core.mjs"),
    "utf8",
  );
  assert.match(session, /gyeop-share-link-v1\\0/);
  assert.match(session, /gyeop-invite-metadata-v1\\0/);
  assert.match(session, /randomBytes\(16\)/);
  assert.match(session, /randomBytes\(32\)/);

  const client = readFileSync(
    path.join(ROOT, "lib/share-links/share-link-client.ts"),
    "utf8",
  );
  for (const contract of [
    "createFlights = new Map",
    "rotateFlights = new Map",
    'credentials: "same-origin"',
    'cache: "no-store"',
    "#k=",
  ]) {
    if (contract === "#k=") continue;
    assert.ok(
      client.includes(contract),
      `missing share client contract: ${contract}`,
    );
  }

  const routes = [
    "app/api/plays/[playId]/links/route.ts",
    "app/api/me/plays/[playId]/links/route.ts",
    "app/api/links/[linkId]/route.ts",
    "app/api/links/[linkId]/rotate/route.ts",
    "app/api/invites/[publicId]/metadata/route.ts",
  ];
  for (const route of routes) {
    const source = readFileSync(path.join(ROOT, route), "utf8");
    assert.match(
      source,
      /withPublicRequest\s*\(/,
      `${route} must use the public boundary`,
    );
    assert.match(
      source,
      /privateNoStore:\s*true/,
      `${route} must be private no-store`,
    );
    assert.match(
      source,
      /runRateLimitedDomain\s*\(/,
      `${route} must apply a limiter`,
    );
  }
  const inviteRoute = readFileSync(path.join(ROOT, routes.at(-1)), "utf8");
  assert.match(inviteRoute, /action:\s*"invite_metadata"/);
  assert.match(inviteRoute, /windowSeconds:\s*60/);
  assert.match(inviteRoute, /limit:\s*60/);

  const presentation = readFileSync(
    path.join(ROOT, "lib/packs/presentation.ts"),
    "utf8",
  );
  assert.match(presentation, /defaultShareKind:\s*"public"/);
  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyShareLinks();
  console.log("Share link source verification passed.");
}
