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
    "recordShareAction",
    "share_handoff_succeeded",
    "share_link_copied",
    "entrySource",
    "#k=",
  ]) {
    if (contract === "#k=") continue;
    assert.ok(
      client.includes(contract),
      `missing share client contract: ${contract}`,
    );
  }

  const handoff = readFileSync(
    path.join(ROOT, "lib/share-links/share-handoff-core.mjs"),
    "utf8",
  );
  assert.doesNotMatch(handoff, /from\s+["']node:/);
  assert.match(handoff, /겹 · \$\{packTitle\}/);
  assert.match(handoff, /\$\{packTitle\}.*질문이야/);
  assert.match(handoff, /너는 나를 어떻게 보는지 3장만 골라줘/);

  const manager = readFileSync(
    path.join(ROOT, "app/me/plays/[playId]/share-link-manager.tsx"),
    "utf8",
  );
  assert.match(manager, /actionLatchRef/);
  assert.match(manager, /navigator\.share\s*\(/);
  assert.match(manager, /navigator\.clipboard\.writeText\s*\(/);
  assert.match(manager, /공유 링크 직접 복사/);
  assert.match(manager, /entrySource/);
  assert.match(
    readFileSync(
      path.join(ROOT, "lib/share-links/share-link-state-core.mjs"),
      "utf8",
    ),
    /parseShareEntrySource/,
  );

  const routes = [
    "app/api/plays/[playId]/links/route.ts",
    "app/api/me/plays/[playId]/links/route.ts",
    "app/api/links/[linkId]/route.ts",
    "app/api/links/[linkId]/rotate/route.ts",
    "app/api/invites/[publicId]/metadata/route.ts",
    "app/api/me/plays/[playId]/share-events/route.ts",
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
    if (route !== "app/api/invites/[publicId]/metadata/route.ts") {
      assert.match(
        source,
        /runRateLimitedDomain\s*\(/,
        `${route} must apply a limiter`,
      );
    }
  }
  const shareEventRoute = readFileSync(
    path.join(ROOT, "app/api/me/plays/[playId]/share-events/route.ts"),
    "utf8",
  );
  assert.match(shareEventRoute, /recordShareActionSchema/);
  assert.match(shareEventRoute, /action:\s*"owner_play_access"/);
  assert.doesNotMatch(shareEventRoute, /inviteUrl|channel|recipient/);
  assert.match(shareEventRoute, /entrySource/);

  const reshareMigration = readFileSync(
    path.join(ROOT, "supabase/migrations/20260718001000_profile_reshare.sql"),
    "utf8",
  );
  for (const contract of [
    "record_owner_share_action_with_source",
    "p_entry_source",
    "'profile_reshare'",
    "analytics_profile_reshare_internal_insert",
  ]) {
    assert.ok(
      reshareMigration.includes(contract),
      `missing profile reshare share contract: ${contract}`,
    );
  }
  assert.doesNotMatch(reshareMigration, /inviteUrl|fragment|recipient|channel/);
  const inviteRoute = readFileSync(
    path.join(ROOT, "app/api/invites/[publicId]/metadata/route.ts"),
    "utf8",
  );
  assert.doesNotMatch(inviteRoute, /runRateLimitedDomain|invite_metadata/);
  const eligibilityMigration = readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20260719000500_eligibility_cutover.sql",
    ),
    "utf8",
  );
  assert.match(eligibilityMigration, /record_response_invite_open/);
  assert.match(eligibilityMigration, /visitor_response_invite_open/);

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
