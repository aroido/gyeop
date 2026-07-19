import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readPackManifests, renderPackSeed } from "./render-pack-seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXPECTED_PACKS = Object.freeze({
  "old-friend": Object.freeze({
    version: "old-friend-v1",
    targetRelationship: "old_friend",
    sensitivity: "low",
    relationshipLabel: "오래된 친구",
  }),
  "first-impression": Object.freeze({
    version: "first-impression-v1",
    targetRelationship: "new_connection",
    sensitivity: "low",
    relationshipLabel: "새로 알게 된 사이",
  }),
  coworker: Object.freeze({
    version: "coworker-v1",
    targetRelationship: "coworker",
    sensitivity: "low",
    relationshipLabel: "직장 동료",
  }),
  "honest-self": Object.freeze({
    version: "honest-self-v1",
    targetRelationship: "close_relationship",
    sensitivity: "medium",
    relationshipLabel: "가까운 사이",
  }),
});

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
  const expected = EXPECTED_PACKS[pack.slug];
  assert.ok(expected, "known pack slug is required");
  assert.ok(boundedString(pack.slug, 64, LOWER_KEBAB));
  assert.equal(pack.version, expected.version);
  assert.ok(boundedString(pack.version, 80, LOWER_KEBAB));
  assert.ok(boundedString(pack.title, 80));
  assert.equal(pack.targetRelationship, expected.targetRelationship);
  assert.equal(pack.sensitivity, expected.sensitivity);
  assert.equal(pack.active, true);
  assert.ok(boundedString(pack.presentation?.moodLabel, 80));
  assert.equal(pack.presentation?.estimatedMinutes, 2);
  assert.ok(
    ["public", "one_to_one"].includes(pack.presentation?.defaultShareKind),
  );
  assert.equal(pack.presentation?.coverRecipe, `${pack.slug}-card-v1`);
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
  assert.match(homeSource, /style=\{pack\.coverStyle\}/);
  assert.doesNotMatch(
    cssSource,
    /(?:background|color|box-shadow|transform)[^;}]*!important/i,
  );
  return true;
}

export async function verifyPackCatalog(root = ROOT) {
  const manifests = readPackManifests(root);
  assert.equal(manifests.length, 4);
  assert.deepEqual(
    new Set(manifests.map((pack) => pack.slug)),
    new Set(Object.keys(EXPECTED_PACKS)),
  );
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

  const [presentation, labels] = await Promise.all([
    import(pathToFileURL(path.join(root, "lib/packs/presentation.ts"))),
    import(pathToFileURL(path.join(root, "lib/packs/labels.ts"))),
  ]);
  for (const manifest of manifests) {
    const config = presentation.getPackPresentation(manifest.slug);
    assert.equal(Object.isFrozen(config), true);
    assert.equal(Object.isFrozen(config.cover), true);
    assert.equal(Object.isFrozen(config.cover.style), true);
    assert.deepEqual(
      {
        moodLabel: config.moodLabel,
        estimatedMinutes: config.estimatedMinutes,
        defaultShareKind: config.defaultShareKind,
        coverRecipe: config.cover.recipe,
      },
      manifest.presentation,
    );
    assert.equal(
      labels.relationshipLabel(manifest.targetRelationship),
      EXPECTED_PACKS[manifest.slug].relationshipLabel,
    );
    assert.equal(
      labels.sensitivityLabel(manifest.sensitivity),
      manifest.sensitivity === "medium" ? "중간 민감도" : "낮은 민감도",
    );
  }
  assert.throws(() => presentation.getPackPresentation("unknown-pack"));
  assert.throws(() => labels.relationshipLabel("unknown"));
  assert.throws(() => labels.sensitivityLabel("unknown"));
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyPackCatalog();
  console.log("Pack catalog verification passed.");
}
