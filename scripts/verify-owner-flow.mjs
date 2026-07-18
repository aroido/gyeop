import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = [
  ["browser storage", /\b(?:localStorage|sessionStorage|indexedDB)\b/],
  ["script-readable cookie", /document\s*\.\s*cookie/],
  ["Supabase client", /(?:@supabase|createClient|\bsupabase\b|\.from\s*\()/i],
];

function filesBelow(root, relative) {
  const target = path.join(root, relative);
  if (!existsSync(target)) return [];
  const files = [];
  for (const entry of readdirSync(target)) {
    const candidate = path.join(target, entry);
    if (statSync(candidate).isDirectory()) {
      files.push(...filesBelow(root, path.relative(root, candidate)));
    } else if (/\.(?:mjs|ts|tsx)$/.test(candidate)) {
      files.push(candidate);
    }
  }
  return files;
}

export function validateOwnerFlowSource(relative, source) {
  for (const [name, pattern] of FORBIDDEN) {
    assert.doesNotMatch(source, pattern, `${relative} must not use ${name}`);
  }
  assert.doesNotMatch(
    source,
    /fetch\s*\(\s*(?:url|input|endpoint|pathname)\b/,
    `${relative} must not accept an arbitrary fetch target`,
  );
  return true;
}

export function verifyOwnerFlow(root = ROOT) {
  const scoped = [
    ...filesBelow(root, "app/play"),
    ...filesBelow(root, "lib/owner-flow"),
  ];
  assert.ok(scoped.length > 0, "owner flow source scope is required");
  for (const file of scoped) {
    validateOwnerFlowSource(
      path.relative(root, file),
      readFileSync(file, "utf8"),
    );
  }

  const client = readFileSync(
    path.join(root, "lib/owner-flow/owner-flow-client.ts"),
    "utf8",
  );
  for (const contract of [
    '"/api/plays"',
    "`/api/plays/${encodeURIComponent(playId)}`",
    "`/api/packs/${encodeURIComponent(packSlug)}`",
    '"/api/me/session"',
    'credentials: "same-origin"',
    'cache: "no-store"',
  ]) {
    assert.ok(
      client.includes(contract),
      `missing owner client contract: ${contract}`,
    );
  }
  assert.match(client, /ownerFlowLoads\s*=\s*new Map/);
  assert.match(client, /bootstrapRequests\s*=\s*new Map/);

  const stateCorePath = path.join(
    root,
    "lib/owner-play/owner-play-state-core.mjs",
  );
  const stateCore = readFileSync(stateCorePath, "utf8");
  assert.doesNotMatch(stateCore, /from\s+["']node:/);
  assert.match(stateCore, /export function decodeOwnerPlayState/);
  const decoderImplementations = filesBelow(root, "lib").reduce(
    (count, file) =>
      count +
      (readFileSync(file, "utf8").match(/function decodeOwnerPlayState/g)
        ?.length ?? 0),
    0,
  );
  assert.equal(
    decoderImplementations,
    1,
    "owner decoder must have one implementation",
  );
  const sessionCore = readFileSync(
    path.join(root, "lib/owner-play/owner-play-session-core.mjs"),
    "utf8",
  );
  assert.match(sessionCore, /from "\.\/owner-play-state-core\.mjs"/);
  assert.match(
    sessionCore,
    /export \{ decodeOwnerPlayState, OWNER_MANAGEMENT_TTL_SECONDS \}/,
  );

  const home = readFileSync(
    path.join(root, "app/(public)/home-client.tsx"),
    "utf8",
  );
  assert.match(home, /href="\/play\/new\?pack=old-friend"/);
  assert.doesNotMatch(home, /href=\{`\/play\/\$\{/);

  const legacy = readFileSync(
    path.join(root, "app/play/old-friend/page.tsx"),
    "utf8",
  );
  assert.match(legacy, /redirect\("\/play\/new\?pack=old-friend"\)/);
  const dynamicPage = readFileSync(
    path.join(root, "app/play/[playId]/page.tsx"),
    "utf8",
  );
  assert.match(dynamicPage, /isOwnerPlayId\(playId\)/);
  assert.equal(existsSync(path.join(root, "app/play/packs.ts")), false);

  return true;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  verifyOwnerFlow();
  console.log("Owner flow source verification passed.");
}
