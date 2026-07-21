import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OPENING_TONES,
  normalizeOpeningTone,
  openingPackIdentity,
  themePackOpeningAnimation,
} from "../../lib/packs/opening-theme.mjs";

const animation = JSON.parse(
  await readFile(
    new URL("../../public/animations/gyeop-pack-opening.json", import.meta.url),
    "utf8",
  ),
);

function fillFingerprint(value, fills = []) {
  if (!value || typeof value !== "object") return fills;
  if (value.ty === "fl" && Array.isArray(value.c?.k)) fills.push(value.c.k);
  for (const child of Object.values(value)) fillFingerprint(child, fills);
  return JSON.stringify(fills);
}

test("creates six distinct opening palettes without mutating the shared Lottie", () => {
  const before = JSON.stringify(animation);
  const fingerprints = OPENING_TONES.map((tone) =>
    fillFingerprint(themePackOpeningAnimation(animation, tone)),
  );

  assert.equal(new Set(fingerprints).size, OPENING_TONES.length);
  assert.equal(JSON.stringify(animation), before);
  for (const tone of OPENING_TONES) {
    const themed = themePackOpeningAnimation(animation, tone);
    assert.deepEqual(
      [themed.w, themed.h, themed.fr, themed.ip, themed.op],
      [animation.w, animation.h, animation.fr, animation.ip, animation.op],
    );
    const details = themed.layers.find((layer) => layer.nm === "front-details");
    assert.equal(
      details.shapes.some(
        (shape) => shape.nm === "brand bars" || shape.nm === "brand pill",
      ),
      false,
    );
  }
});

test("falls back to the lime palette for an unknown tone", () => {
  assert.equal(normalizeOpeningTone("ultraviolet"), "lime");
  assert.equal(normalizeOpeningTone(null), "lime");
  assert.equal(
    fillFingerprint(themePackOpeningAnimation(animation, "ultraviolet")),
    fillFingerprint(themePackOpeningAnimation(animation, "lime")),
  );
});

test("derives a stable visible identity from each cover recipe", () => {
  assert.deepEqual(openingPackIdentity("first-impression-card-v1"), {
    mark: "FI",
    pattern: openingPackIdentity("first-impression-card-v1").pattern,
  });
  assert.notDeepEqual(
    openingPackIdentity("first-impression-card-v1"),
    openingPackIdentity("reply-temperature-card-v1"),
  );
  assert.deepEqual(openingPackIdentity(null), { mark: "GY", pattern: "bars" });
});
