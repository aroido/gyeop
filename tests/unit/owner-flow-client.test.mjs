import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  consumePreloadedOwnerFlow,
  createOrResumeOwnerPlay,
  preloadOwnerFlow,
} from "../../lib/owner-flow/owner-flow-client.ts";

const manifest = JSON.parse(
  await readFile(
    new URL("../../content/packs/old-friend-v1.json", import.meta.url),
    "utf8",
  ),
);
const publishedPack = Object.fromEntries(
  [
    "cards",
    "sensitivity",
    "slug",
    "targetRelationship",
    "title",
    "version",
  ].map((key) => [key, manifest[key]]),
);

test("owner client sends the create contract", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  try {
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return Response.json(
        { code: "INVALID_INPUT", message: "요청을 처리할 수 없습니다." },
        {
          status: 400,
          headers: { "cache-control": "private, no-store" },
        },
      );
    };
    await assert.rejects(createOrResumeOwnerPlay("old-friend", "home"));
    assert.deepEqual(bodies, [{ packSlug: "old-friend", entrySource: "home" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner client accepts every active pack through the create contract", async () => {
  const originalFetch = globalThis.fetch;
  const bodies = [];
  try {
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return Response.json(
        {
          id: "19000000-0000-4000-8000-000000000010",
          packSlug: "deadline-mode",
          packVersion: "deadline-mode-v1",
          status: "draft",
          currentPosition: 1,
          answers: [],
          managementExpiresAt: "2026-07-25T00:00:00.000Z",
          managementTtlSeconds: 604800,
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    };
    const play = await createOrResumeOwnerPlay("deadline-mode");
    assert.equal(play.packSlug, "deadline-mode");
    assert.deepEqual(bodies, [
      { packSlug: "deadline-mode", entrySource: "home" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner client consumes a successful opening preload exactly once", async () => {
  const originalFetch = globalThis.fetch;
  const play = {
    id: "19000000-0000-4000-8000-000000000011",
    packSlug: "old-friend",
    packVersion: "old-friend-v1",
    status: "draft",
    currentPosition: 1,
    answers: [],
    managementExpiresAt: "2026-07-25T00:00:00.000Z",
    managementTtlSeconds: 604800,
  };
  let fetches = 0;
  try {
    globalThis.fetch = async (url) => {
      fetches += 1;
      assert.equal(url, "/api/packs/old-friend");
      return Response.json(publishedPack);
    };
    const preload = preloadOwnerFlow(play);
    assert.equal(preloadOwnerFlow(play), preload);
    await preload;
    assert.equal(consumePreloadedOwnerFlow(play.id), preload);
    assert.equal(consumePreloadedOwnerFlow(play.id), null);
    assert.equal(fetches, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
