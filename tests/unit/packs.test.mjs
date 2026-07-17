import assert from "node:assert/strict";
import test from "node:test";

import { packs } from "../../app/play/packs.ts";

test("official prototype packs have valid isolated card data", () => {
  const entries = Object.entries(packs);
  assert.equal(entries.length, 4);
  assert.equal(
    new Set(entries.map(([, pack]) => pack.storageKey)).size,
    entries.length,
  );

  for (const [slug, pack] of entries) {
    assert.equal(pack.slug, slug);
    assert.equal(pack.cards.length, 10);
    assert.equal(
      pack.cards.filter((card) => card.signature).length,
      1,
      `${slug} must have one Signature card`,
    );
    assert.equal(
      new Set(pack.cards.map((card) => card.id)).size,
      pack.cards.length,
      `${slug} card ids must be unique`,
    );

    for (const card of pack.cards) {
      for (const value of [card.id, card.question, card.a, card.b]) {
        assert.ok(value.trim(), `${slug} cards must not contain blank fields`);
      }
      assert.notEqual(card.a, card.b);
    }
  }

  for (const slug of ["first-impression", "coworker", "honest-self"]) {
    for (const card of packs[slug].cards) {
      assert.ok(
        card.visitorQuestion?.trim(),
        `${slug} cards need reviewed visitor wording`,
      );
    }
  }
});
