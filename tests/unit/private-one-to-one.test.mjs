import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeOwnerOneToOneComparisonOutcome,
  decodeOwnerOneToOneListOutcome,
  decodePrivateOneToOneComparison,
  decodePrivateOneToOneList,
} from "../../lib/private-one-to-one/private-one-to-one-core.mjs";
import {
  getPrivateOneToOneComparison,
  listPrivateOneToOneResponses,
  PrivateOneToOneHttpError,
} from "../../lib/private-one-to-one/private-one-to-one-client.ts";

const responseId = "28000000-0000-4000-8000-000000000001";
const shareLinkId = "28100000-0000-4000-8000-000000000001";
const submitted = Object.freeze({
  id: responseId,
  shareLinkId,
  status: "submitted",
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  submittedAt: "2030-01-02T00:00:00Z",
  withdrawnAt: null,
});
const assignments = Object.freeze([
  Object.freeze({
    cardId: "conflict",
    stage: "required",
    position: 1,
    packPosition: 1,
    visitorPrompt: "갈등이 생겼을 때 나는?",
    optionA: "바로 이야기한다",
    optionB: "시간을 두고 이야기한다",
    isSignature: true,
    visitorChoice: "b",
    ownerChoice: "a",
    matches: false,
    isHighlight: true,
  }),
  Object.freeze({
    cardId: "plans",
    stage: "required",
    position: 2,
    packPosition: 3,
    visitorPrompt: "약속을 잡을 때 나는?",
    optionA: "미리 계획한다",
    optionB: "그날 정한다",
    isSignature: false,
    visitorChoice: "a",
    ownerChoice: "a",
    matches: true,
    isHighlight: false,
  }),
  Object.freeze({
    cardId: "hard-day",
    stage: "required",
    position: 3,
    packPosition: 10,
    visitorPrompt: "힘든 날 나는?",
    optionA: "조용히 곁에 있어 달라고 한다",
    optionB: "기분 전환을 부탁한다",
    isSignature: false,
    visitorChoice: "b",
    ownerChoice: "b",
    matches: true,
    isHighlight: false,
  }),
  Object.freeze({
    cardId: "comfort",
    stage: "optional",
    position: 1,
    packPosition: 4,
    visitorPrompt: "위로가 필요할 때 나는?",
    optionA: "곁에 있어 달라고 한다",
    optionB: "혼자 정리한다",
    isSignature: false,
    visitorChoice: "a",
    ownerChoice: "a",
    matches: true,
    isHighlight: false,
  }),
]);
const comparison = Object.freeze({
  id: responseId,
  packTitle: "오래 본 너의 시선",
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  submittedAt: submitted.submittedAt,
  allMatched: false,
  assignments,
});

test("strictly decodes sanitized list rows and withdrawn tombstones", () => {
  const withdrawn = {
    ...submitted,
    id: "28000000-0000-4000-8000-000000000002",
    shareLinkId: "28100000-0000-4000-8000-000000000002",
    status: "withdrawn",
    relationshipCode: null,
    knownSinceCode: null,
    submittedAt: "2030-01-01T00:00:00Z",
    withdrawnAt: "2030-01-03T00:00:00Z",
  };
  assert.deepEqual(
    decodePrivateOneToOneList({ responses: [submitted, withdrawn] }),
    {
      responses: [submitted, withdrawn],
    },
  );
  for (const invalid of [
    { responses: [{ ...submitted, visitorName: "비밀" }] },
    { responses: [{ ...submitted, relationshipCode: null }] },
    { responses: [{ ...withdrawn, relationshipCode: "old_friend" }] },
    { responses: [withdrawn, submitted] },
    {
      responses: [
        { ...withdrawn, submittedAt: submitted.submittedAt },
        submitted,
      ],
    },
    { responses: [submitted, submitted] },
  ]) {
    assert.throws(() => decodePrivateOneToOneList(invalid));
  }
});

test("strictly decodes only complete private comparisons", () => {
  assert.deepEqual(decodePrivateOneToOneComparison(comparison), comparison);
  for (const invalid of [
    { ...comparison, sessionExpiresAt: "2030-01-03T00:00:00Z" },
    { ...comparison, allMatched: true },
    { ...comparison, assignments: assignments.slice(0, 2) },
    {
      ...comparison,
      assignments: assignments.map((item, index) =>
        index === 0 ? { ...item, isHighlight: false } : item,
      ),
    },
    {
      ...comparison,
      assignments: assignments.map((item, index) =>
        index === 1 ? { ...item, matches: false } : item,
      ),
    },
  ]) {
    assert.throws(() => decodePrivateOneToOneComparison(invalid));
  }
});

test("strictly decodes owner RPC envelopes", () => {
  const management = {
    managementExpiresAt: "2030-01-08T00:00:00Z",
    managementTtlSeconds: 604800,
  };
  assert.equal(
    decodeOwnerOneToOneListOutcome({
      outcome: "listed",
      ...management,
      responses: [submitted],
    }).outcome,
    "listed",
  );
  assert.equal(
    decodeOwnerOneToOneComparisonOutcome({
      outcome: "authorized",
      ...management,
      comparison,
    }).outcome,
    "authorized",
  );
  assert.deepEqual(
    decodeOwnerOneToOneComparisonOutcome({ outcome: "response_not_found" }),
    { outcome: "response_not_found" },
  );
  assert.throws(() =>
    decodeOwnerOneToOneListOutcome({
      outcome: "listed",
      ...management,
      responses: [submitted],
      secret: "leak",
    }),
  );
});

test("uses exact no-store endpoints and single-flights browser reads", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let release;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    await new Promise((resolve) => {
      release = resolve;
    });
    const body = String(url).includes("/responses?kind=")
      ? { responses: [submitted] }
      : comparison;
    return Response.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  };
  try {
    const first = listPrivateOneToOneResponses(
      "27000000-0000-4000-8000-000000000001",
    );
    const second = listPrivateOneToOneResponses(
      "27000000-0000-4000-8000-000000000001",
    );
    assert.equal(first, second);
    assert.equal(calls.length, 1);
    release();
    assert.deepEqual(await first, [submitted]);
    assert.deepEqual(calls[0], {
      url: "/api/me/plays/27000000-0000-4000-8000-000000000001/responses?kind=one_to_one",
      init: {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      },
    });

    const detail = getPrivateOneToOneComparison(responseId);
    assert.equal(calls.length, 2);
    release();
    assert.deepEqual(await detail, comparison);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps private read failures to status-only errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {},
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  try {
    await assert.rejects(
      getPrivateOneToOneComparison(responseId),
      (error) =>
        error instanceof PrivateOneToOneHttpError && error.status === 404,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects invalid identifiers and cacheable responses before decoding", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ responses: [] });
  };
  try {
    await assert.rejects(listPrivateOneToOneResponses("bad-id"));
    await assert.rejects(getPrivateOneToOneComparison("bad-id"));
    assert.equal(calls, 0);
    await assert.rejects(
      listPrivateOneToOneResponses("27000000-0000-4000-8000-000000000001"),
      (error) => error instanceof PrivateOneToOneHttpError,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
