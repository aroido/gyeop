import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  parseFrozenPackTable,
  validateCoverSources,
  validatePackManifest,
  verifyPackCatalog,
} from "../../scripts/verify-pack-catalog.mjs";
import {
  readPackManifests,
  readPackSeedManifests,
} from "../../scripts/render-pack-seed.mjs";
import { decodePublishedPack } from "../../lib/packs/published-pack-core.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const manifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/old-friend-v1.json"), "utf8"),
);

test("repository pack catalog trace passes", async () => {
  await verifyPackCatalog(root);
});

test("catalog selects the latest manifest without discarding frozen v1 files", () => {
  const manifests = readPackManifests(root);
  const seedManifests = readPackSeedManifests(root);
  assert.equal(manifests.length, 24);
  assert.equal(
    manifests.find(({ slug }) => slug === "old-friend")?.version,
    "old-friend-v2",
  );
  assert.equal(
    manifests.find(({ slug }) => slug === "coworker")?.version,
    "coworker-v1",
  );
  assert.equal(seedManifests.length, 45);
  assert.deepEqual(
    seedManifests
      .filter(({ slug }) => slug === "old-friend")
      .map(({ version }) => version),
    ["old-friend-v1", "old-friend-v2"],
  );
});

test("manifest rejects malformed publication content", () => {
  assert.equal(validatePackManifest(structuredClone(manifest)), true);
  for (const mutate of [
    (copy) => copy.cards.pop(),
    (copy) => {
      copy.cards[1].isSignature = true;
    },
    (copy) => {
      copy.cards[0].id = "Not_Kebab";
    },
    (copy) => {
      copy.cards[0].optionB = copy.cards[0].optionA;
    },
    (copy) => {
      copy.targetRelationship = "unknown";
    },
  ]) {
    const copy = structuredClone(manifest);
    mutate(copy);
    assert.throws(() => validatePackManifest(copy));
  }
});

test("published pack decoder rejects extra, coerced, reordered, and leaky rows", () => {
  const published = {
    slug: manifest.slug,
    title: manifest.title,
    version: manifest.version,
    targetRelationship: manifest.targetRelationship,
    sensitivity: manifest.sensitivity,
    cards: manifest.cards,
  };
  assert.deepEqual(decodePublishedPack(structuredClone(published)), published);
  for (const mutate of [
    (copy) => {
      copy.internalId = "leak";
    },
    (copy) => {
      copy.cards[0].position = "1";
    },
    (copy) => copy.cards.reverse(),
    (copy) => {
      copy.cards[0].draft = true;
    },
    (copy) => {
      copy.cards[0].isSignature = false;
    },
  ]) {
    const copy = structuredClone(published);
    mutate(copy);
    assert.throws(() => decodePublishedPack(copy));
  }
});

test("cover trace rejects missing application and important overrides", () => {
  assert.equal(
    validateCoverSources(
      "<article data-cover-variant={pack.coverRecipe} className={styles[`${pack.coverTone}Card`]}",
      ".limeCard { background: #dfff00; }",
    ),
    true,
  );
  assert.throws(() => validateCoverSources("<article />", ""));
  assert.throws(() =>
    validateCoverSources(
      "<article data-cover-variant={pack.coverRecipe} className={styles[`${pack.coverTone}Card`]}",
      ".limeCard { background: red !important; }",
    ),
  );
});

test("document parser reads exactly the frozen ten cards", () => {
  const docs = readFileSync(
    path.join(root, "docs/product/question-pack-spec.md"),
    "utf8",
  );
  assert.deepEqual(parseFrozenPackTable(docs), manifest.cards);
});
