import assert from "node:assert/strict";
import test from "node:test";

import {
  CONCEPT_CATALOG_V1,
  CONCEPT_CONTEXT_V1_ALLOWLIST,
  decodeConceptCatalog,
  isConceptContextV1,
  isConceptId,
} from "../../lib/concepts/catalog-core.mjs";

test("freezes the reviewed eight areas and 32 concepts", () => {
  assert.equal(CONCEPT_CATALOG_V1.version, 1);
  assert.equal(CONCEPT_CATALOG_V1.areas.length, 8);
  assert.equal(CONCEPT_CATALOG_V1.concepts.length, 32);
  assert.equal(
    new Set(CONCEPT_CATALOG_V1.concepts.map(({ id }) => id)).size,
    32,
  );
  assert.equal(CONCEPT_CONTEXT_V1_ALLOWLIST.size, 215);
  assert.ok(Object.isFrozen(CONCEPT_CATALOG_V1));
  assert.equal(isConceptId("rel.entry"), true);
  assert.equal(isConceptId("rel.unknown"), false);
  assert.equal(isConceptContextV1("여행·변경"), true);
  assert.equal(isConceptContextV1("여행"), false);
});

test("rejects unknown keys, duplicate concepts, and changed directions", () => {
  for (const mutate of [
    (value) => {
      value.extra = true;
    },
    (value) => {
      value.concepts[1].id = value.concepts[0].id;
    },
    (value) => {
      value.concepts[0].areaId = "pref";
    },
    (value) => {
      value.concepts[0].directionB = value.concepts[0].directionA;
    },
  ]) {
    const value = structuredClone(CONCEPT_CATALOG_V1);
    mutate(value);
    assert.throws(() => decodeConceptCatalog(value), /Invalid concept catalog/);
  }
});
