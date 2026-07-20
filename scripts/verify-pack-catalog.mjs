import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readPackManifests, renderPackSeed } from "./render-pack-seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUIRED_PACK_SLUGS = new Set([
  "old-friend",
  "first-impression",
  "coworker",
  "honest-self",
]);
const TARGET_RELATIONSHIPS = new Set([
  "old_friend",
  "new_connection",
  "coworker",
  "close_relationship",
]);
const COVER_TONES = new Set([
  "lime",
  "blue",
  "coral",
  "ink",
  "violet",
  "cream",
]);

function boundedString(value, maximum, pattern) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= maximum &&
    (!pattern || pattern.test(value))
  );
}

export function validatePackManifest(pack) {
  assert.ok(boundedString(pack.slug, 64, LOWER_KEBAB));
  assert.ok(boundedString(pack.version, 80, LOWER_KEBAB));
  assert.equal(pack.version, `${pack.slug}-v1`);
  assert.ok(boundedString(pack.title, 80));
  assert.ok(TARGET_RELATIONSHIPS.has(pack.targetRelationship));
  assert.ok(["low", "medium", "high"].includes(pack.sensitivity));
  assert.equal(pack.active, true);
  assert.ok(boundedString(pack.presentation?.moodLabel, 80));
  assert.equal(pack.presentation?.estimatedMinutes, 2);
  assert.ok(
    ["public", "one_to_one"].includes(pack.presentation?.defaultShareKind),
  );
  assert.equal(pack.presentation?.coverRecipe, `${pack.slug}-card-v1`);
  assert.ok(COVER_TONES.has(pack.presentation?.coverTone));
  assert.equal(pack.cards.length, 10);
  assert.equal(new Set(pack.cards.map((card) => card.id)).size, 10);
  assert.equal(pack.cards.filter((card) => card.isSignature).length, 1);
  for (const [index, card] of pack.cards.entries()) {
    assert.ok(boundedString(card.id, 64, LOWER_KEBAB));
    assert.equal(card.position, index + 1);
    assert.ok(boundedString(card.ownerPrompt, 200));
    assert.ok(boundedString(card.visitorPrompt, 200));
    assert.ok(boundedString(card.optionA, 120));
    assert.ok(boundedString(card.optionB, 120));
    assert.notEqual(card.optionA, card.optionB);
    assert.equal(typeof card.isSignature, "boolean");
  }
  return true;
}

export function parseFrozenPackTable(markdown) {
  const section = markdown.split("## 12. 비공개 검증팩 — 오래된 친구 v1")[1];
  assert.ok(section, "old-friend document section is required");
  const rows = [];
  for (const line of section.split("\n")) {
    const columns = line
      .split("|")
      .slice(1, -1)
      .map((value) => value.trim());
    if (columns.length !== 7 || !/^\d+$/.test(columns[0])) continue;
    const position = Number(columns[0]);
    if (position < 1 || position > 10) continue;
    rows.push({
      position,
      id: columns[1].replaceAll("`", ""),
      isSignature: columns[2] === "✓",
      ownerPrompt: columns[3],
      visitorPrompt: columns[4],
      optionA: columns[5],
      optionB: columns[6],
    });
  }
  return rows;
}

export function validateCoverSources(homeSource, cssSource) {
  assert.match(homeSource, /data-cover-variant=\{pack\.coverRecipe\}/);
  assert.match(homeSource, /pack\.coverTone/);
  assert.doesNotMatch(
    cssSource,
    /(?:background|color|box-shadow|transform)[^;}]*!important/i,
  );
  return true;
}

export async function verifyPackCatalog(root = ROOT) {
  const manifests = readPackManifests(root);
  assert.ok(
    manifests.length >= 24,
    "at least 24 active official packs are required",
  );
  for (const slug of REQUIRED_PACK_SLUGS) {
    assert.ok(manifests.some((pack) => pack.slug === slug));
  }
  for (const manifest of manifests) validatePackManifest(manifest);
  const oldFriend = manifests.find((pack) => pack.slug === "old-friend");
  assert.ok(oldFriend);
  const manifestBytes = readFileSync(
    path.join(root, "content/packs/old-friend-v1.json"),
  );

  const [docs, seed, homeSource, cssSource] = [
    "docs/product/question-pack-spec.md",
    "supabase/seed.sql",
    "app/(public)/home-client.tsx",
    "app/(public)/page.module.css",
  ].map((file) => readFileSync(path.join(root, file), "utf8"));
  const hash = createHash("sha256").update(manifestBytes).digest("hex");
  assert.ok(docs.includes(`manifest SHA-256: \`${hash}\``));
  assert.deepEqual(parseFrozenPackTable(docs), oldFriend.cards);
  assert.equal(seed, renderPackSeed(manifests));
  validateCoverSources(homeSource, cssSource);

  for (const manifest of manifests) {
    assert.equal(
      manifest.presentation.defaultShareKind,
      manifest.sensitivity === "low" ? "public" : "one_to_one",
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyPackCatalog();
  console.log("Pack catalog verification passed.");
}
