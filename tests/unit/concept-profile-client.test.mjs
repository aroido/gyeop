import assert from "node:assert/strict";
import test from "node:test";

import {
  recordConceptDetailOpened,
  recordConceptProfileViewed,
} from "../../lib/owner-profile/concept-profile-client.ts";
import {
  recordOwnerProfileReshareClicked,
  recordOwnerProfileViewed,
} from "../../lib/owner-profile/owner-profile-client.ts";

const playId = "15700000-0000-4000-8000-000000000001";

test("four owner profile events send their one exact strict body", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({
        url,
        method: init.method,
        body: JSON.parse(init.body),
        keepalive: init.keepalive,
      });
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
    };
    await recordOwnerProfileViewed(playId);
    await recordOwnerProfileReshareClicked(playId);
    await recordConceptProfileViewed(playId);
    await recordConceptDetailOpened(playId, "rel.initiation");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(
    calls.map(({ body }) => body),
    [
      { event: "profile_viewed", playId },
      { event: "profile_reshare_clicked", playId },
      { event: "concept_profile_viewed", playId },
      {
        event: "concept_detail_opened",
        playId,
        conceptId: "rel.initiation",
      },
    ],
  );
  assert.ok(
    calls.every(
      ({ url, method, keepalive }) =>
        url === "/api/me/profile/events" &&
        method === "POST" &&
        keepalive === true,
    ),
  );
});

test("profile event clients fail closed on response or identifier drift", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 500,
        headers: { "cache-control": "private, no-store" },
      });
    await assert.rejects(recordOwnerProfileReshareClicked(playId));
    await assert.rejects(recordConceptProfileViewed(playId));
    assert.throws(() => recordConceptDetailOpened(playId, ""));
    await assert.rejects(recordOwnerProfileViewed("not-a-uuid"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
