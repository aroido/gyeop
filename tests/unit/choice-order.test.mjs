import assert from "node:assert/strict";
import test from "node:test";

import {
  choiceOrder,
  visitorChoiceOrdinal,
} from "../../lib/packs/choice-order.mjs";

test("alternates visual order without changing semantic choices", () => {
  assert.deepEqual(choiceOrder(1, "왼쪽 의미", "오른쪽 의미"), [
    { choice: "a", label: "왼쪽 의미" },
    { choice: "b", label: "오른쪽 의미" },
  ]);
  assert.deepEqual(choiceOrder(2, "왼쪽 의미", "오른쪽 의미"), [
    { choice: "b", label: "오른쪽 의미" },
    { choice: "a", label: "왼쪽 의미" },
  ]);
  assert.throws(() => choiceOrder(0, "a", "b"), /Invalid choice order/);
});

test("continues visitor ordinals through required and optional stages", () => {
  const ordinals = [
    visitorChoiceOrdinal("required", 1),
    visitorChoiceOrdinal("required", 2),
    visitorChoiceOrdinal("required", 3),
    visitorChoiceOrdinal("optional", 1),
    visitorChoiceOrdinal("optional", 2),
  ];
  assert.deepEqual(ordinals, [1, 2, 3, 4, 5]);
  assert.deepEqual(
    ordinals.map((ordinal) =>
      choiceOrder(ordinal, "a", "b")
        .map(({ choice }) => choice)
        .join(","),
    ),
    ["a,b", "b,a", "a,b", "b,a", "a,b"],
  );
});
