import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const animation = JSON.parse(
  await readFile(
    new URL("../../public/animations/gyeop-pack-opening.json", import.meta.url),
    "utf8",
  ),
);

function layer(name) {
  return animation.layers.find((item) => item.nm === name);
}

function walk(value, matches = []) {
  if (!value || typeof value !== "object") return matches;
  if (value.ty) matches.push(value);
  for (const child of Object.values(value)) walk(child, matches);
  return matches;
}

function keyframes(value, matches = []) {
  if (!value || typeof value !== "object") return matches;
  if (Object.hasOwn(value, "t") && Object.hasOwn(value, "e")) {
    matches.push(value);
  }
  for (const child of Object.values(value)) keyframes(child, matches);
  return matches;
}

test("pack opening Lottie keeps the reviewed open pack and card geometry", () => {
  assert.deepEqual(
    [animation.w, animation.h, animation.fr, animation.ip, animation.op],
    [360, 520, 60, 0, 120],
  );
  for (const frame of keyframes(animation)) {
    assert.ok(frame.i && frame.o, "interpolated keyframes need Lottie easing");
  }
  assert.deepEqual(
    animation.layers.map(({ nm }) => nm),
    [
      "front-lip",
      "front-details",
      "front-pack",
      "question-card",
      "back-lip",
      "back-pack",
      "halo",
    ],
  );
  assert.equal(layer("tear-strip"), undefined);

  for (const lip of [layer("front-lip"), layer("back-lip")]) {
    assert.equal(
      walk(lip.shapes).some(({ ty }) => ty === "el"),
      false,
      "foil lips must not be oval holes",
    );
  }

  const cardFace = walk(layer("question-card").shapes).find(
    ({ nm }) => nm === "card face",
  );
  const cardSize = walk(cardFace).find(({ ty }) => ty === "rc").s.k;
  assert.deepEqual(cardSize, [190, 266]);
  assert.ok(Math.abs(cardSize[0] / cardSize[1] - 5 / 7) < 0.001);
});
