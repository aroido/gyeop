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
