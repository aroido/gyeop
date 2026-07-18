import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readPackManifest, renderPackSeed } from "./render-pack-seed.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOWER_KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  assert.equal(pack.slug, "old-friend");
  assert.ok(boundedString(pack.slug, 64, LOWER_KEBAB));
  assert.equal(pack.version, "old-friend-v1");
  assert.ok(boundedString(pack.version, 80, LOWER_KEBAB));
  assert.ok(boundedString(pack.title, 80));
  assert.equal(pack.targetRelationship, "old_friend");
  assert.equal(pack.sensitivity, "low");
  assert.equal(pack.active, true);
  assert.deepEqual(pack.presentation, {
    moodLabel: "따뜻한 회상",
    estimatedMinutes: 2,
    defaultShareKind: "public",
    coverRecipe: "old-friend-card-v1",
  });
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
  const manifestPath = path.join(root, "content/packs/old-friend-v1.json");
  const manifestBytes = readFileSync(manifestPath);
  const manifest = readPackManifest(root);
  validatePackManifest(manifest);

  const [docs, seed, homeSource, cssSource] = [
    "docs/product/question-pack-spec.md",
    "supabase/seed.sql",
    "app/(public)/home-client.tsx",
    "app/(public)/page.module.css",
  ].map((file) => readFileSync(path.join(root, file), "utf8"));
  const hash = createHash("sha256").update(manifestBytes).digest("hex");
  assert.ok(docs.includes(`manifest SHA-256: \`${hash}\``));
  assert.deepEqual(parseFrozenPackTable(docs), manifest.cards);
  assert.equal(seed, renderPackSeed(manifest));
  validateCoverSources(homeSource, cssSource);

  const [presentation, labels] = await Promise.all([
    import(pathToFileURL(path.join(root, "lib/packs/presentation.ts"))),
    import(pathToFileURL(path.join(root, "lib/packs/labels.ts"))),
  ]);
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
    "오래된 친구",
  );
  assert.equal(labels.sensitivityLabel(manifest.sensitivity), "낮은 민감도");
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
