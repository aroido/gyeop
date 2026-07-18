import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeVisitorResponseHttpState,
  decodeVisitorResponseState,
  KNOWN_SINCE_OPTIONS,
  RELATIONSHIP_OPTIONS,
  visitorResponseHttpState,
} from "../../lib/visitor-response/visitor-context-core.mjs";
import {
  decodeStartResponseOutcome,
  deriveResponseStartRateLimitKey,
  hashVisitorResponseSecret,
  parseVisitorResponseCookie,
  serializeDeletedVisitorResponseCookie,
  serializeVisitorResponseCookie,
  VISITOR_RESPONSE_COOKIE_NAME,
} from "../../lib/visitor-response/visitor-session-core.mjs";
import {
  resumeVisitorResponse,
  startVisitorResponse,
  VisitorResponseHttpError,
} from "../../lib/visitor-response/visitor-response-client.ts";

const id = "22000000-0000-4000-8000-000000000001";
const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const cookieValue = `v1.${id}.${secret}`;
const state = Object.freeze({
  id,
  status: "draft",
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  sessionExpiresAt: "2030-01-02T00:00:00Z",
  sessionTtlSeconds: 86_400,
});

test("freezes the exact relationship and known-since registries", () => {
  assert.deepEqual(
    RELATIONSHIP_OPTIONS.map(({ code, label }) => [code, label]),
    [
      ["old_friend", "오래된 친구"],
      ["school_friend", "학교 친구"],
      ["coworker", "직장 동료"],
      ["romantic", "썸·연인"],
      ["family", "가족"],
      ["online_friend", "온라인 친구"],
      ["social_follower", "SNS 팔로워·온라인에서만 봄"],
      ["other", "기타"],
    ],
  );
  assert.deepEqual(
    KNOWN_SINCE_OPTIONS.map(({ code, label }) => [code, label]),
    [
      ["under_one_year", "1년 미만이에요"],
      ["one_to_three_years", "1년 이상 · 3년 미만"],
      ["three_to_five_years", "3년 이상 · 5년 미만"],
      ["five_to_ten_years", "5년 이상 · 10년 미만"],
      ["ten_years_or_more", "10년 이상이에요"],
      ["not_sure", "잘 모르겠어요"],
    ],
  );
  assert.equal(Object.isFrozen(RELATIONSHIP_OPTIONS), true);
  assert.equal(Object.isFrozen(KNOWN_SINCE_OPTIONS), true);
});

test("strictly decodes DB and browser response state", () => {
  assert.deepEqual(decodeVisitorResponseState(state), state);
  const http = visitorResponseHttpState(state);
  assert.deepEqual(http, {
    ...state,
    relationshipLabel: "오래된 친구",
    knownSinceLabel: "10년 이상이에요",
  });
  assert.deepEqual(
    decodeVisitorResponseHttpState(http, Date.parse("2030-01-01T00:00:00Z")),
    http,
  );
  assert.throws(() => decodeVisitorResponseState({ ...state, extra: true }));
  assert.throws(() =>
    decodeVisitorResponseState({
      ...state,
      sessionExpiresAt: "February 3, 2030",
    }),
  );
  assert.throws(() =>
    decodeVisitorResponseHttpState(
      { ...http, relationshipLabel: "친구" },
      Date.parse("2030-01-01T00:00:00Z"),
    ),
  );
  assert.throws(() =>
    decodeVisitorResponseHttpState(http, Date.parse(state.sessionExpiresAt)),
  );
});

test("uses the exact response credential and rate-key vectors", () => {
  assert.equal(
    hashVisitorResponseSecret(
      Uint8Array.from({ length: 32 }, (_, i) => i),
    ).toString("hex"),
    "cd14ce89186655f35031108d679cab09551ea0f53bcf4576cbc30f947f4fbaf6",
  );
  assert.equal(
    deriveResponseStartRateLimitKey(
      Uint8Array.from({ length: 32 }, (_, i) => i),
      "AAAAAAAAAAAAAAAAAAAAAA",
    ).toString("hex"),
    "7f667381a24e34737c6fba266ae316b2070295a195b6c00598f198bd3a363e6a",
  );
});

test("parses one canonical response cookie and rejects ambiguity", () => {
  const parsed = parseVisitorResponseCookie(
    `a=1; ${VISITOR_RESPONSE_COOKIE_NAME}=${cookieValue}; b=2`,
  );
  assert.equal(parsed.outcome, "valid");
  assert.equal(parsed.responseId, id);
  assert.equal(parsed.value, cookieValue);
  assert.equal(
    parsed.sessionTokenHash.toString("hex"),
    "cd14ce89186655f35031108d679cab09551ea0f53bcf4576cbc30f947f4fbaf6",
  );
  assert.deepEqual(parseVisitorResponseCookie(null), { outcome: "absent" });
  for (const header of [
    `${VISITOR_RESPONSE_COOKIE_NAME}=bad`,
    `${VISITOR_RESPONSE_COOKIE_NAME}=${cookieValue}; ${VISITOR_RESPONSE_COOKIE_NAME}=${cookieValue}`,
    `${VISITOR_RESPONSE_COOKIE_NAME}=v1.${id}.${secret.slice(1)}`,
  ]) {
    assert.deepEqual(parseVisitorResponseCookie(header), {
      outcome: "malformed",
    });
  }
});

test("serializes a fixed-expiry secure response cookie without renewal", () => {
  assert.equal(
    serializeVisitorResponseCookie(
      cookieValue,
      86_400,
      "2030-01-02T00:00:00Z",
      new Date("2030-01-01T12:00:00Z"),
    ),
    `${VISITOR_RESPONSE_COOKIE_NAME}=${cookieValue}; Path=/; Expires=Wed, 02 Jan 2030 00:00:00 GMT; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`,
  );
  assert.equal(
    serializeVisitorResponseCookie(
      cookieValue,
      1,
      "2030-01-01T00:00:00Z",
      new Date("2030-01-01T00:00:00Z"),
    ),
    null,
  );
  assert.equal(
    serializeDeletedVisitorResponseCookie(),
    `${VISITOR_RESPONSE_COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  );
});

test("strictly decodes every start-response outcome", () => {
  assert.deepEqual(
    decodeStartResponseOutcome({ outcome: "created", response: state }),
    {
      outcome: "created",
      response: state,
    },
  );
  assert.deepEqual(
    decodeStartResponseOutcome({
      outcome: "rate_limited",
      retryAfterSeconds: 17,
    }),
    { outcome: "rate_limited", retryAfterSeconds: 17 },
  );
  for (const outcome of [
    "collision",
    "no_session",
    "session_invalid",
    "unavailable",
  ]) {
    assert.deepEqual(decodeStartResponseOutcome({ outcome }), { outcome });
  }
  assert.throws(() =>
    decodeStartResponseOutcome({ outcome: "unavailable", responseId: id }),
  );
  const symbol = { outcome: "unavailable" };
  symbol[Symbol("hidden")] = true;
  assert.throws(() => decodeStartResponseOutcome(symbol));
});

const httpState = Object.freeze({
  ...state,
  sessionExpiresAt: "2099-01-02T00:00:00Z",
  relationshipLabel: "오래된 친구",
  knownSinceLabel: "10년 이상이에요",
});

test("browser client accepts only exact no-store response outcomes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(null, {
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
    assert.equal(
      await resumeVisitorResponse("AAAAAAAAAAAAAAAAAAAAAA", secret),
      null,
    );

    globalThis.fetch = async () =>
      Response.json(
        { ...httpState, extra: "leak" },
        { headers: { "cache-control": "private, no-store" } },
      );
    await assert.rejects(
      resumeVisitorResponse("AAAAAAAAAAAAAAAAAAAAAA", secret),
      (error) =>
        error instanceof VisitorResponseHttpError &&
        error.code === "INVALID_RESPONSE",
    );

    globalThis.fetch = async () =>
      Response.json(
        { code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "cache-control": "private, no-store" },
        },
      );
    await assert.rejects(
      startVisitorResponse(
        "AAAAAAAAAAAAAAAAAAAAAA",
        secret,
        "old_friend",
        "ten_years_or_more",
      ),
      (error) =>
        error instanceof VisitorResponseHttpError &&
        error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser start single-flight sends one same-tick HTTP request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  try {
    globalThis.fetch = () => {
      calls += 1;
      return new Promise((resolve) => {
        release = () =>
          resolve(
            Response.json(httpState, {
              status: 201,
              headers: { "cache-control": "private, no-store" },
            }),
          );
      });
    };
    const first = startVisitorResponse(
      "AAAAAAAAAAAAAAAAAAAAAA",
      secret,
      "old_friend",
      "ten_years_or_more",
    );
    const second = startVisitorResponse(
      "AAAAAAAAAAAAAAAAAAAAAA",
      secret,
      "old_friend",
      "ten_years_or_more",
    );
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await Promise.all([first, second]), [
      httpState,
      httpState,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
