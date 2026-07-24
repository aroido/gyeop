import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readPackManifests,
  readPackSeedManifests,
  renderPackSeed,
} from "./render-pack-seed.mjs";
import {
  OFFICIAL_PACK_HISTORY,
  OFFICIAL_PACKS,
} from "../lib/packs/official-pack-registry.mjs";
import {
  CONCEPT_CATALOG_V1,
  CONCEPT_CONTEXT_V1_ALLOWLIST,
} from "../lib/concepts/catalog-core.mjs";

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

function parseTsv(source, expectedHeaders) {
  const [header, ...lines] = source.trimEnd().split("\n");
  assert.deepEqual(header.split("\t"), expectedHeaders);
  return lines.map((line) =>
    Object.fromEntries(
      line.split("\t").map((value, index) => [expectedHeaders[index], value]),
    ),
  );
}

function renderedSignals(card) {
  return card.conceptSignals
    .map(
      ({ conceptId, directionForOptionA }) =>
        `${conceptId}:${directionForOptionA.toUpperCase()}`,
    )
    .join(",");
}

export function validatePackManifest(pack) {
  assert.ok(boundedString(pack.slug, 64, LOWER_KEBAB));
  assert.ok(boundedString(pack.version, 80, LOWER_KEBAB));
  assert.match(pack.version, new RegExp(`^${pack.slug}-v[1-9]\\d*$`));
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
    assert.ok((card.visitorPrompt.match(/이 사람/g) ?? []).length <= 1);
    assert.doesNotMatch(
      card.visitorPrompt,
      /(^|\s)(?:나는|내가|나를|나에게|내)(?=$|\s|\?)/,
    );
    assert.ok(boundedString(card.optionA, 120));
    assert.ok(boundedString(card.optionB, 120));
    assert.notEqual(card.optionA, card.optionB);
    assert.equal(typeof card.isSignature, "boolean");
    if (pack.conceptVersion === 1) {
      assert.ok(CONCEPT_CONTEXT_V1_ALLOWLIST.has(card.conceptContext));
      assert.ok(
        Array.isArray(card.conceptSignals) &&
          card.conceptSignals.length >= 1 &&
          card.conceptSignals.length <= 2,
      );
      assert.equal(
        new Set(card.conceptSignals.map(({ conceptId }) => conceptId)).size,
        card.conceptSignals.length,
      );
      for (const signal of card.conceptSignals) {
        assert.ok(
          CONCEPT_CATALOG_V1.concepts.some(({ id }) => id === signal.conceptId),
        );
        assert.ok(["a", "b"].includes(signal.directionForOptionA));
      }
    } else {
      assert.equal(pack.conceptVersion, undefined);
      assert.equal(card.conceptContext, undefined);
      assert.equal(card.conceptSignals, undefined);
    }
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
  const history = readPackSeedManifests(root);
  assert.equal(
    manifests.length,
    24,
    "exactly 24 active official packs are required",
  );
  for (const slug of REQUIRED_PACK_SLUGS) {
    assert.ok(manifests.some((pack) => pack.slug === slug));
  }
  for (const manifest of manifests) validatePackManifest(manifest);
  assert.equal(history.length, 69, "pack history must contain 69 versions");
  assert.equal(
    history.reduce((count, pack) => count + pack.cards.length, 0),
    690,
    "pack history must contain 690 cards",
  );
  for (const manifest of history) {
    assert.match(manifest.version, new RegExp(`^${manifest.slug}-v[1-9]\\d*$`));
    assert.equal(manifest.cards.length, 10);
    assert.equal(new Set(manifest.cards.map(({ id }) => id)).size, 10);
  }
  assert.ok(manifests.every(({ conceptVersion }) => conceptVersion === 1));
  const currentCards = manifests.flatMap(({ cards }) => cards);
  assert.equal(currentCards.length, 240);
  assert.equal(
    currentCards.reduce(
      (count, { conceptSignals }) => count + conceptSignals.length,
      0,
    ),
    289,
  );
  assert.deepEqual(
    new Set(currentCards.map(({ conceptContext }) => conceptContext)),
    CONCEPT_CONTEXT_V1_ALLOWLIST,
  );

  const conceptDistribution = new Map(
    CONCEPT_CATALOG_V1.concepts.map(({ id }) => [
      id,
      { cards: new Set(), packs: new Set(), contexts: new Set() },
    ]),
  );
  for (const manifest of manifests) {
    const packConcepts = new Map();
    const packAreas = new Set();
    for (const card of manifest.cards) {
      for (const { conceptId } of card.conceptSignals) {
        const concept = CONCEPT_CATALOG_V1.concepts.find(
          ({ id }) => id === conceptId,
        );
        packAreas.add(concept.areaId);
        packConcepts.set(conceptId, (packConcepts.get(conceptId) ?? 0) + 1);
        const distribution = conceptDistribution.get(conceptId);
        distribution.cards.add(`${manifest.slug}\0${card.id}`);
        distribution.packs.add(manifest.slug);
        distribution.contexts.add(card.conceptContext);
      }
    }
    assert.ok(packAreas.size >= 4, `${manifest.slug} has too few areas`);
    assert.ok(packConcepts.size >= 6, `${manifest.slug} has too few concepts`);
    assert.ok(
      [...packConcepts.values()].every((count) => count <= 3),
      `${manifest.slug} repeats one concept too often`,
    );
  }
  for (const [conceptId, distribution] of conceptDistribution) {
    assert.ok(distribution.cards.size >= 6, `${conceptId} has too few cards`);
    assert.ok(distribution.packs.size >= 3, `${conceptId} has too few packs`);
    assert.ok(
      distribution.contexts.size >= 3,
      `${conceptId} has too few contexts`,
    );
  }
  assert.equal(
    new Set(manifests.map(({ title }) => title)).size,
    manifests.length,
  );
  const ownerPrompts = new Map();
  for (const manifest of manifests) {
    for (const card of manifest.cards) {
      const existing = ownerPrompts.get(card.ownerPrompt);
      assert.equal(
        existing,
        undefined,
        `${manifest.slug}/${card.id} duplicates ${existing}`,
      );
      ownerPrompts.set(card.ownerPrompt, `${manifest.slug}/${card.id}`);
    }
  }
  const registryByVersion = new Map(
    OFFICIAL_PACKS.map((pack) => [`${pack.slug}\0${pack.version}`, pack]),
  );
  assert.equal(OFFICIAL_PACK_HISTORY.length, 69);
  assert.equal(
    registryByVersion.size,
    manifests.length,
    "the owner-flow registry must list every active pack exactly once",
  );
  for (const manifest of manifests) {
    const registryPack = registryByVersion.get(
      `${manifest.slug}\0${manifest.version}`,
    );
    assert.ok(
      registryPack,
      `the owner-flow registry is missing ${manifest.slug}@${manifest.version}`,
    );
    assert.deepEqual(
      registryPack.cardIds,
      manifest.cards.map((card) => card.id),
      `the owner-flow registry card order drifted for ${manifest.slug}@${manifest.version}`,
    );
  }
  const oldFriend = manifests.find((pack) => pack.slug === "old-friend");
  assert.ok(oldFriend);
  const frozenOldFriend = JSON.parse(
    readFileSync(path.join(root, "content/packs/old-friend-v1.json"), "utf8"),
  );
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
  assert.deepEqual(parseFrozenPackTable(docs), frozenOldFriend.cards);
  assert.equal(
    seed,
    renderPackSeed(readPackSeedManifests(root), {
      singleStatement: true,
    }),
  );
  validateCoverSources(homeSource, cssSource);

  const mapping = parseTsv(
    readFileSync(
      path.join(root, "docs/product/concept-card-mapping-v0.tsv"),
      "utf8",
    ),
    ["pack", "version", "card_id", "signature", "context", "signals"],
  );
  const rewrites = parseTsv(
    readFileSync(
      path.join(root, "docs/product/concept-card-rewrites-v0.tsv"),
      "utf8",
    ),
    [
      "pack",
      "source_version",
      "card_id",
      "owner_prompt",
      "visitor_prompt",
      "option_a",
      "option_b",
      "signals",
    ],
  );
  assert.equal(mapping.length, 240);
  assert.equal(rewrites.length, 48);
  const mappingByKey = new Map(
    mapping.map((row) => [`${row.pack}\0${row.version}\0${row.card_id}`, row]),
  );
  for (const row of rewrites) {
    const current = manifests.find(({ slug }) => slug === row.pack);
    const card = current?.cards.find(({ id }) => id === row.card_id);
    const mapped = mappingByKey.get(
      `${row.pack}\0${row.source_version}\0${row.card_id}`,
    );
    assert.ok(card && mapped);
    assert.equal(card.ownerPrompt, row.owner_prompt);
    assert.equal(card.visitorPrompt, row.visitor_prompt);
    assert.equal(card.optionA, row.option_a);
    assert.equal(card.optionB, row.option_b);
    assert.equal(row.signals, mapped.signals);
    assert.equal(renderedSignals(card), row.signals);
  }

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
