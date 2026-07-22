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
  decodeAssignOptionalCardsOutcome,
  decodeGetVisitorResponseOutcome,
  decodeRecordVisitorResponseEventOutcome,
  decodeSaveResponseAnswerOutcome,
  decodeStartResponseOutcome,
  decodeSubmitResponseOutcome,
  decodeWithdrawResponseOutcome,
  deriveResponseActionRateLimitKey,
  deriveResponseStartRateLimitKey,
  hashVisitorManagementSecret,
  hashVisitorResponseSecret,
  parseVisitorResponseCookie,
  serializeDeletedVisitorResponseCookie,
  serializeVisitorResponseCookie,
  VISITOR_RESPONSE_COOKIE_NAME,
} from "../../lib/visitor-response/visitor-session-core.mjs";
import {
  buildManagementUrl,
  completeManagementRecord,
  ensurePendingManagementRecord,
  parseManagementFragment,
  readManagementRecord,
  removeManagementRecordMatchingSecret,
} from "../../lib/visitor-management/management-secret.ts";
import {
  continueVisitorResponse,
  readVisitorResponse,
  recordVisitorEvent,
  resumeVisitorResponse,
  saveVisitorAnswer,
  startVisitorResponse,
  submitVisitorAnswers,
  VisitorResponseHttpError,
} from "../../lib/visitor-response/visitor-response-client.ts";

const id = "22000000-0000-4000-8000-000000000001";
const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const cookieValue = `v1.${id}.${secret}`;
const assignments = Object.freeze([
  Object.freeze({
    cardId: "conflict",
    stage: "required",
    position: 1,
    visitorPrompt: "친구가 갈등을 풀 때 더 가까운 모습은?",
    optionA: "바로 이야기한다",
    optionB: "시간을 두고 이야기한다",
    isSignature: true,
    visitorChoice: null,
  }),
  Object.freeze({
    cardId: "hard-day",
    stage: "required",
    position: 2,
    visitorPrompt: "친구가 힘든 날 더 원하는 것은?",
    optionA: "조용히 곁에 있어 주기",
    optionB: "기분 전환을 도와주기",
    isSignature: false,
    visitorChoice: null,
  }),
  Object.freeze({
    cardId: "plans",
    stage: "required",
    position: 3,
    visitorPrompt: "친구와 약속을 잡을 때 더 가까운 모습은?",
    optionA: "미리 계획한다",
    optionB: "그날 정한다",
    isSignature: false,
    visitorChoice: null,
  }),
]);
const state = Object.freeze({
  id,
  status: "draft",
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  sessionExpiresAt: "2030-01-02T00:00:00Z",
  sessionTtlSeconds: 86_400,
  assignments,
});
const packMetadata = Object.freeze({
  packSlug: "old-friend",
  packVersion: "old-friend-v2",
  packTitle: "우리는 아직도 통하는 편",
});
const submittedState = Object.freeze({
  ...state,
  status: "submitted",
  allMatched: false,
  assignments: Object.freeze(
    assignments.map((assignment, index) =>
      Object.freeze({
        ...assignment,
        packPosition: [1, 10, 3][index],
        visitorChoice: index === 1 ? "b" : "a",
        ownerChoice: "a",
        matches: index !== 1,
        isHighlight: index === 1,
      }),
    ),
  ),
});
const assignedOptionalState = Object.freeze({
  ...submittedState,
  assignments: Object.freeze([
    ...submittedState.assignments,
    Object.freeze({
      cardId: "comfort",
      stage: "optional",
      position: 1,
      packPosition: 2,
      visitorPrompt: "위로가 필요할 때 이 사람은?",
      optionA: "곁에 있어 달라고 한다",
      optionB: "혼자 정리할 시간을 갖는다",
      isSignature: false,
      visitorChoice: null,
      ownerChoice: null,
      matches: null,
      isHighlight: false,
    }),
    Object.freeze({
      cardId: "reconnect",
      stage: "optional",
      position: 2,
      packPosition: 4,
      visitorPrompt: "오랜만에 연락할 때 이 사람은?",
      optionA: "먼저 안부를 묻는다",
      optionB: "계기가 생길 때까지 기다린다",
      isSignature: false,
      visitorChoice: null,
      ownerChoice: null,
      matches: null,
      isHighlight: false,
    }),
  ]),
});
const completedOptionalState = Object.freeze({
  ...assignedOptionalState,
  assignments: Object.freeze(
    assignedOptionalState.assignments.map((assignment) =>
      assignment.stage === "optional"
        ? Object.freeze({
            ...assignment,
            visitorChoice: "a",
            ownerChoice: assignment.position === 1 ? "a" : "b",
            matches: assignment.position === 1,
          })
        : assignment,
    ),
  ),
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
  const http = visitorResponseHttpState({ ...state, ...packMetadata });
  assert.deepEqual(http, {
    ...state,
    ...packMetadata,
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
  assert.deepEqual(
    decodeVisitorResponseState(assignedOptionalState),
    assignedOptionalState,
  );
  assert.deepEqual(
    decodeVisitorResponseState(completedOptionalState),
    completedOptionalState,
  );
  assert.throws(() =>
    decodeVisitorResponseState({
      ...assignedOptionalState,
      assignments: assignedOptionalState.assignments.map((assignment) =>
        assignment.stage === "optional" && assignment.position === 1
          ? { ...assignment, ownerChoice: "a" }
          : assignment,
      ),
    }),
  );
  const twoDifferences = {
    ...submittedState,
    assignments: submittedState.assignments.map((assignment, index) => ({
      ...assignment,
      visitorChoice: index === 0 ? "a" : "b",
      matches: index === 0,
      isHighlight: index === 2,
    })),
  };
  assert.deepEqual(decodeVisitorResponseState(twoDifferences), twoDifferences);
  assert.throws(() =>
    decodeVisitorResponseState({
      ...twoDifferences,
      assignments: twoDifferences.assignments.map((assignment, index) => ({
        ...assignment,
        isHighlight: index === 1,
      })),
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
  assert.deepEqual(decodeVisitorResponseState(submittedState), submittedState);
  assert.throws(() =>
    decodeVisitorResponseState({ ...submittedState, allMatched: true }),
  );
  assert.throws(() =>
    decodeVisitorResponseState({
      ...submittedState,
      assignments: submittedState.assignments.map((assignment) => ({
        ...assignment,
        isHighlight: false,
      })),
    }),
  );
});

test("rejects malformed or privacy-leaking assignment payloads", () => {
  const invalidAssignments = [
    assignments.slice(0, 2),
    [assignments[0], assignments[1], { ...assignments[2], position: 2 }],
    [assignments[0], assignments[1], { ...assignments[2], cardId: "hard-day" }],
    [{ ...assignments[0], isSignature: false }, assignments[1], assignments[2]],
    [assignments[0], { ...assignments[1], isSignature: true }, assignments[2]],
    [{ ...assignments[0], packPosition: 1 }, assignments[1], assignments[2]],
    [
      { ...assignments[0], ownerPrompt: "비공개 자기 질문" },
      assignments[1],
      assignments[2],
    ],
    [
      assignments[0],
      { ...assignments[1], optionB: assignments[1].optionA },
      assignments[2],
    ],
  ];
  for (const candidate of invalidAssignments) {
    assert.throws(() =>
      decodeVisitorResponseState({ ...state, assignments: candidate }),
    );
  }
  assert.throws(() =>
    decodeVisitorResponseState({
      ...submittedState,
      assignments: submittedState.assignments.map((assignment, index) => ({
        ...assignment,
        packPosition: index === 2 ? 10 : assignment.packPosition,
      })),
    }),
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
  assert.equal(
    hashVisitorManagementSecret(secret).toString("hex"),
    "a3d92f51751e5ef82ff0d9ada678b4fdb3ab20a2fef6f4ac58a37e2ca775150d",
  );
  assert.equal(
    deriveResponseActionRateLimitKey(id, "response_answer_save").toString(
      "hex",
    ),
    "51bfa4f29109adfd68625a185fb130cd447ee30266a0a195a7db24d3da01d57a",
  );
  assert.equal(
    deriveResponseActionRateLimitKey(id, "response_submit").toString("hex"),
    "4bdcce0d0dfc3f822f89a04b3fb41c608520c27658bf402491b9056c96b73d2a",
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
    VISITOR_RESPONSE_COOKIE_NAME,
    `${VISITOR_RESPONSE_COOKIE_NAME}; ${VISITOR_RESPONSE_COOKIE_NAME}=${cookieValue}`,
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

test("strictly decodes read, save, submit, and event outcomes", () => {
  assert.deepEqual(
    decodeGetVisitorResponseOutcome({ outcome: "authorized", response: state }),
    { outcome: "authorized", response: state },
  );
  assert.deepEqual(
    decodeSaveResponseAnswerOutcome({ outcome: "saved", response: state }),
    { outcome: "saved", response: state },
  );
  assert.deepEqual(
    decodeAssignOptionalCardsOutcome({
      outcome: "assigned",
      response: assignedOptionalState,
    }),
    { outcome: "assigned", response: assignedOptionalState },
  );
  assert.deepEqual(
    decodeSubmitResponseOutcome({
      outcome: "submitted",
      response: submittedState,
    }),
    { outcome: "submitted", response: submittedState },
  );
  assert.deepEqual(
    decodeRecordVisitorResponseEventOutcome({ outcome: "recorded" }),
    { outcome: "recorded" },
  );
  assert.deepEqual(decodeSubmitResponseOutcome({ outcome: "incomplete" }), {
    outcome: "incomplete",
  });
  assert.deepEqual(
    decodeSaveResponseAnswerOutcome({
      outcome: "saved",
      response: completedOptionalState,
    }),
    { outcome: "saved", response: completedOptionalState },
  );
  assert.throws(() =>
    decodeRecordVisitorResponseEventOutcome({
      outcome: "recorded",
      responseId: id,
    }),
  );
});

test("persists one exact browser-only management record", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const source = {
    getRandomValues(bytes) {
      bytes.set(Uint8Array.from({ length: 32 }, (_, index) => index));
      return bytes;
    },
  };
  const pending = ensurePendingManagementRecord(id, storage, source);
  assert.deepEqual(pending, {
    version: 1,
    responseId: id,
    status: "pending",
    secret,
  });
  assert.deepEqual(ensurePendingManagementRecord(id, storage, source), pending);
  assert.deepEqual(completeManagementRecord(id, storage), {
    ...pending,
    status: "completed",
  });
  assert.equal(
    buildManagementUrl("https://gyeop.example", secret),
    `https://gyeop.example/responses/manage#token=${secret}`,
  );
  values.set(
    `gyeop:visitor-management:v1:${id}`,
    JSON.stringify({ ...pending, leaked: true }),
  );
  assert.throws(() => readManagementRecord(id, storage));
  assert.deepEqual(ensurePendingManagementRecord(id, storage, source), pending);
});

test("parses an exact management fragment and removes only its strict record", () => {
  assert.equal(parseManagementFragment(`#token=${secret}`), secret);
  for (const fragment of [
    "",
    `?token=${secret}`,
    `#token=${encodeURIComponent(secret)}&extra=1`,
    `#extra=1&token=${secret}`,
    `#token=${secret}#again`,
    "#token=bad",
  ]) {
    assert.throws(() => parseManagementFragment(fragment));
  }

  const otherId = "22000000-0000-4000-8000-000000000002";
  const otherSecret = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
  const values = new Map([
    [
      `gyeop:visitor-management:v1:${id}`,
      JSON.stringify({
        version: 1,
        responseId: id,
        status: "completed",
        secret,
      }),
    ],
    [
      `gyeop:visitor-management:v1:${otherId}`,
      JSON.stringify({
        version: 1,
        responseId: otherId,
        status: "completed",
        secret: otherSecret,
      }),
    ],
    ["gyeop:visitor-management:v1:not-a-response", "malformed"],
    ["unrelated", secret],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  };
  assert.equal(removeManagementRecordMatchingSecret(secret, storage), true);
  assert.equal(values.has(`gyeop:visitor-management:v1:${id}`), false);
  assert.equal(values.has(`gyeop:visitor-management:v1:${otherId}`), true);
  assert.equal(values.has("gyeop:visitor-management:v1:not-a-response"), true);
  assert.equal(values.has("unrelated"), true);
});

test("strictly decodes visitor withdrawal outcomes", () => {
  assert.deepEqual(decodeWithdrawResponseOutcome({ outcome: "withdrawn" }), {
    outcome: "withdrawn",
  });
  assert.deepEqual(decodeWithdrawResponseOutcome({ outcome: "unavailable" }), {
    outcome: "unavailable",
  });
  assert.throws(() =>
    decodeWithdrawResponseOutcome({ outcome: "withdrawn", responseId: id }),
  );
});

const httpState = Object.freeze({
  ...state,
  ...packMetadata,
  sessionExpiresAt: "2099-01-02T00:00:00Z",
  relationshipLabel: "오래된 친구",
  knownSinceLabel: "10년 이상이에요",
});
const submittedHttpState = Object.freeze({
  ...submittedState,
  ...packMetadata,
  sessionExpiresAt: "2099-01-02T00:00:00Z",
  relationshipLabel: "오래된 친구",
  knownSinceLabel: "10년 이상이에요",
});
const assignedOptionalHttpState = Object.freeze({
  ...assignedOptionalState,
  ...packMetadata,
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

test("browser client uses the exact read, save, submit, and event routes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (String(url).endsWith("/events")) {
        return new Response(null, {
          status: 204,
          headers: { "cache-control": "private, no-store" },
        });
      }
      return Response.json(
        String(url).endsWith("/submit")
          ? submittedHttpState
          : String(url).endsWith("/continue")
            ? assignedOptionalHttpState
            : httpState,
        { headers: { "cache-control": "private, no-store" } },
      );
    };
    assert.deepEqual(await readVisitorResponse(id), httpState);
    assert.deepEqual(await saveVisitorAnswer(id, "conflict", "a"), httpState);
    assert.deepEqual(
      await submitVisitorAnswers(id, secret),
      submittedHttpState,
    );
    assert.deepEqual(
      await continueVisitorResponse(id),
      assignedOptionalHttpState,
    );
    await recordVisitorEvent(id, "comparison_viewed");
    assert.deepEqual(
      calls.map(({ url, init }) => [url, init.method, init.body ?? null]),
      [
        [`/api/responses/${id}`, "GET", null],
        [
          `/api/responses/${id}/answers/conflict`,
          "PUT",
          JSON.stringify({ choice: "a" }),
        ],
        [
          `/api/responses/${id}/submit`,
          "POST",
          JSON.stringify({ managementSecret: secret }),
        ],
        [`/api/responses/${id}/continue`, "POST", JSON.stringify({})],
        [
          `/api/responses/${id}/events`,
          "POST",
          JSON.stringify({ event: "comparison_viewed" }),
        ],
      ],
    );
    assert.equal(calls[4].init.keepalive, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("browser start single-flight sends one same-tick HTTP request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let requestBody;
  let release;
  try {
    globalThis.fetch = (_url, init) => {
      calls += 1;
      requestBody = JSON.parse(init.body);
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
    assert.deepEqual(requestBody, {
      intent: "start",
      secret,
      relationshipCode: "old_friend",
      knownSinceCode: "ten_years_or_more",
    });
    release();
    assert.deepEqual(await Promise.all([first, second]), [
      httpState,
      httpState,
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
