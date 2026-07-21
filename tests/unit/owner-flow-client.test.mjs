import assert from "node:assert/strict";
import test from "node:test";

import { createOrResumeOwnerPlay } from "../../lib/owner-flow/owner-flow-client.ts";

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
