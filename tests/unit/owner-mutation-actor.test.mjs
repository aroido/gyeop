import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  deriveRecoveryActorCandidates,
  executeOwnerMutationActor,
} from "../../lib/db/owner-mutation-actor-core.mjs";

function readers() {
  return [
    { keyVersion: "v1", key: Buffer.alloc(32, 1) },
    { keyVersion: "v2", key: Buffer.alloc(32, 2) },
  ];
}

test("derives one domain-separated candidate per retained reader", () => {
  const candidates = deriveRecoveryActorCandidates("owner-1", readers());
  assert.deepEqual(
    candidates.map(({ keyVersion }) => keyVersion),
    ["v1", "v2"],
  );
  assert.equal(new Set(candidates.map(({ hash }) => hash)).size, 2);
  assert.ok(
    candidates.every(
      ({ hash }) => Buffer.from(hash, "base64url").length === 32,
    ),
  );
});

test("uses one fresh auth result and passes an active total-deadline signal", async () => {
  let authCalls = 0;
  let callbackCalls = 0;

  const result = await executeOwnerMutationActor({
    startedAt: 100,
    now: () => 150,
    getUser: async () => {
      authCalls += 1;
      return { data: { user: { id: "owner-1" } } };
    },
    loadKeyring: () => ({ readers: readers() }),
    callback: async ({ actor, signal }) => {
      callbackCalls += 1;
      assert.equal(actor.uid, "owner-1");
      assert.equal(actor.recoveryActorCandidates.length, 2);
      assert.equal(signal.aborted, false);
      return "saved";
    },
  });

  assert.equal(result, "saved");
  assert.equal(authCalls, 1);
  assert.equal(callbackCalls, 1);
});

test("fails closed before callback on auth, keyring, and deadline errors", async () => {
  let callbackCalls = 0;
  const callback = async () => {
    callbackCalls += 1;
  };

  await assert.rejects(
    executeOwnerMutationActor({
      startedAt: 0,
      now: () => 1,
      getUser: async () => ({ data: { user: null }, error: new Error("auth") }),
      loadKeyring: () => ({ readers: readers() }),
      callback,
    }),
    /authentication is unavailable/,
  );

  await assert.rejects(
    executeOwnerMutationActor({
      startedAt: 0,
      now: () => 1,
      getUser: async () => ({ data: { user: { id: "owner-1" } } }),
      loadKeyring: () => ({
        readers: [{ keyVersion: "unknown", key: Buffer.alloc(2) }],
      }),
      callback,
    }),
    /reader is invalid/,
  );

  await assert.rejects(
    executeOwnerMutationActor({
      startedAt: 0,
      now: () => 30_001,
      getUser: async () => ({ data: { user: { id: "owner-1" } } }),
      loadKeyring: () => ({ readers: readers() }),
      callback,
    }),
    /deadline exceeded/,
  );

  assert.equal(callbackCalls, 0);
});

test("a retry requires a new execution and fresh auth call", async () => {
  let authCalls = 0;
  const run = () =>
    executeOwnerMutationActor({
      startedAt: 0,
      now: () => 1,
      getUser: async () => {
        authCalls += 1;
        return { data: { user: { id: `owner-${authCalls}` } } };
      },
      loadKeyring: () => ({ readers: readers() }),
      callback: async ({ actor }) => actor.uid,
    });

  assert.equal(await run(), "owner-1");
  assert.equal(await run(), "owner-2");
  assert.equal(authCalls, 2);
});
