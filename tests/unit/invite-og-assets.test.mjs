import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ImageResponse } from "next/og.js";
import { createElement } from "react";

import { inviteOgFallbackResponse } from "../../lib/share-links/invite-og-fallback.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const fallbackPath = path.join(root, "public/og/gyeop-share.png");
const fontPath = path.join(
  root,
  "app/i/[publicId]/assets/NotoSansKR-InviteSubset.ttf",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("static fallback is an independently valid 1200x630 PNG", async () => {
  const png = await readFile(fallbackPath);
  assert.equal(
    sha256(png),
    "6ed835d2f8a27b976896d248be9e14df1dc7436d2cc5b84d56827b7ea103ad20",
  );
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test("fallback response returns the exact static bytes without caching", async () => {
  const expected = await readFile(fallbackPath);
  const response = await inviteOgFallbackResponse(root);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
});

test("pinned local TTF subset and provenance stay reproducible", async () => {
  const [font, provenance] = await Promise.all([
    readFile(fontPath),
    readFile(path.join(root, "app/i/[publicId]/assets/README.md"), "utf8"),
  ]);
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.equal(
    sha256(font),
    "686b8c75de265ca1d0a487851dd802419319d06ff808a0e6684cce2b7df8c380",
  );
  assert.match(provenance, /U\+0020-007E,U\+AC00-D7A3/);
  assert.match(provenance, /가힣AZaz09/);
});

test("local Korean font renders through ImageResponse", async () => {
  const font = await readFile(fontPath);
  const response = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          fontFamily: "Noto Sans KR",
          fontSize: 72,
        },
      },
      "가힣AZaz09님을 보는 내 시선은?",
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Noto Sans KR",
          data: new Uint8Array(font).buffer,
          weight: 900,
          style: "normal",
        },
      ],
    },
  );
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
