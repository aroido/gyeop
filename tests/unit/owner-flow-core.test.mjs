import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  decodeOwnerFlow,
  isOwnerFlowReadyToComplete,
  ownerFlowReducer,
  ownerSaveStatus,
} from "../../lib/owner-flow/owner-flow-core.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const manifest = JSON.parse(
  readFileSync(path.join(root, "content/packs/old-friend-v1.json"), "utf8"),
);
const pack = {
  slug: manifest.slug,
  version: manifest.version,
  title: manifest.title,
  targetRelationship: manifest.targetRelationship,
  sensitivity: manifest.sensitivity,
  cards: manifest.cards.map(({ isSignature, ...card }) => ({
    ...card,
    isSignature,
  })),
};

function play(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    packSlug: manifest.slug,
    packVersion: manifest.version,
    status: "draft",
    currentPosition: 1,
    answers: [],
    managementExpiresAt: "2026-07-25T00:00:00Z",
    managementTtlSeconds: 604800,
    ...overrides,
  };
}

function savedAnswers(count, lastChoice = "a") {
  return manifest.cards.slice(0, count).map((card, index) => ({
    cardId: card.id,
    choice: index === count - 1 ? lastChoice : "a",
  }));
}

test("strictly initializes owner state against the published pack", () => {
  const flow = decodeOwnerFlow(
    play({ currentPosition: 2, answers: savedAnswers(1) }),
    pack,
  );
  assert.equal(flow.phase, "draft");
  assert.equal(flow.currentIndex, 1);
  assert.equal(flow.answers.conflict, "a");
  assert.equal(ownerSaveStatus(flow), "saved");

  assert.throws(() =>
    decodeOwnerFlow(play({ packVersion: "old-friend-v2" }), pack),
  );
  assert.throws(() =>
    decodeOwnerFlow(play(), { ...pack, version: "old-friend-v2" }),
  );
});

test("moves optimistically and preserves same-card edit order over stale saves", () => {
  let flow = decodeOwnerFlow(play(), pack);
  flow = ownerFlowReducer(flow, {
    type: "choose",
    cardId: "conflict",
    choice: "a",
  });
  assert.equal(flow.currentIndex, 1);
  assert.equal(flow.answers.conflict, "a");
  assert.equal(flow.queue[0].currentPosition, 2);
  assert.equal(ownerSaveStatus(flow), "saving");

  flow = ownerFlowReducer(flow, { type: "save-started", sequence: 1 });
  flow = ownerFlowReducer(flow, { type: "previous" });
  flow = ownerFlowReducer(flow, {
    type: "choose",
    cardId: "conflict",
    choice: "b",
  });
  assert.deepEqual(
    flow.queue.map(({ sequence, choice }) => ({ sequence, choice })),
    [
      { sequence: 1, choice: "a" },
      { sequence: 2, choice: "b" },
    ],
  );

  flow = ownerFlowReducer(flow, {
    type: "save-succeeded",
    sequence: 1,
    play: play({ currentPosition: 2, answers: savedAnswers(1, "a") }),
  });
  assert.equal(flow.answers.conflict, "b");
  assert.equal(flow.queue[0].sequence, 2);
  assert.equal(flow.inFlightSequence, null);

  flow = ownerFlowReducer(flow, { type: "save-started", sequence: 2 });
  flow = ownerFlowReducer(flow, {
    type: "save-succeeded",
    sequence: 2,
    play: play({ currentPosition: 2, answers: savedAnswers(1, "b") }),
  });
  assert.equal(flow.answers.conflict, "b");
  assert.equal(flow.queue.length, 0);
  assert.equal(ownerSaveStatus(flow), "saved");
});

test("pauses at a failed head and resumes the exact sequence", () => {
  let flow = decodeOwnerFlow(play(), pack);
  flow = ownerFlowReducer(flow, {
    type: "choose",
    cardId: "conflict",
    choice: "a",
  });
  flow = ownerFlowReducer(flow, { type: "save-started", sequence: 1 });
  flow = ownerFlowReducer(flow, { type: "save-failed", sequence: 1 });
  assert.equal(flow.failedSequence, 1);
  assert.equal(flow.queue[0].sequence, 1);
  assert.equal(ownerSaveStatus(flow), "failed");

  flow = ownerFlowReducer(flow, { type: "retry-save" });
  flow = ownerFlowReducer(flow, { type: "save-started", sequence: 1 });
  assert.equal(flow.inFlightSequence, 1);
  assert.equal(flow.queue[0].sequence, 1);
});

test("requires ten saved answers and an empty queue before completion", () => {
  const nine = decodeOwnerFlow(
    play({ currentPosition: 10, answers: savedAnswers(9) }),
    pack,
  );
  assert.equal(isOwnerFlowReadyToComplete(nine), false);

  const ten = decodeOwnerFlow(
    play({ currentPosition: 10, answers: savedAnswers(10) }),
    pack,
  );
  assert.equal(isOwnerFlowReadyToComplete(ten), true);
  const started = ownerFlowReducer(ten, { type: "completion-started" });
  assert.equal(started.completion, "in-flight");
  assert.equal(isOwnerFlowReadyToComplete(started), false);
});

test("incomplete hydration moves to a missing card or exposes explicit retry", () => {
  let flow = decodeOwnerFlow(
    play({ currentPosition: 10, answers: savedAnswers(10) }),
    pack,
  );
  flow = ownerFlowReducer(flow, { type: "completion-started" });
  flow = ownerFlowReducer(flow, {
    type: "incomplete-refreshed",
    play: play({ currentPosition: 10, answers: savedAnswers(9) }),
  });
  assert.equal(flow.currentIndex, 9);
  assert.equal(flow.completion, "idle");

  flow = decodeOwnerFlow(
    play({ currentPosition: 10, answers: savedAnswers(10) }),
    pack,
  );
  flow = ownerFlowReducer(flow, { type: "completion-started" });
  flow = ownerFlowReducer(flow, {
    type: "incomplete-refreshed",
    play: play({ currentPosition: 10, answers: savedAnswers(10) }),
  });
  assert.equal(flow.completion, "retryable");
  assert.equal(
    ownerFlowReducer(flow, { type: "completion-retry" }).completion,
    "idle",
  );
});

test("completed hydration and completion success are read-only", () => {
  const completedPlay = play({
    status: "completed",
    currentPosition: 10,
    answers: savedAnswers(10),
  });
  let flow = decodeOwnerFlow(completedPlay, pack);
  assert.equal(flow.phase, "completed");
  const unchanged = ownerFlowReducer(flow, {
    type: "choose",
    cardId: "hard-day",
    choice: "b",
  });
  assert.equal(unchanged, flow);

  flow = decodeOwnerFlow(
    play({ currentPosition: 10, answers: savedAnswers(10) }),
    pack,
  );
  flow = ownerFlowReducer(flow, { type: "completion-started" });
  flow = ownerFlowReducer(flow, {
    type: "completion-succeeded",
    play: completedPlay,
  });
  assert.equal(flow.phase, "completed");
  assert.equal(flow.completion, "completed");
});
