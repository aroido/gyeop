import { createHmac } from "node:crypto";

const RECOVERY_ACTOR_DOMAIN = "gyeop:account-delete-recovery-actor:v1\0";

/**
 * @param {string} uid
 * @param {ReadonlyArray<{keyVersion: string, key: Uint8Array}>} readers
 */
export function deriveRecoveryActorCandidates(uid, readers) {
  if (!uid || !Array.isArray(readers) || readers.length === 0) {
    throw new Error("Owner mutation actor inputs are unavailable");
  }

  return Object.freeze(
    readers.map(({ keyVersion, key }) => {
      if (!keyVersion || !(key instanceof Uint8Array) || key.byteLength < 32) {
        throw new Error("Owner mutation actor reader is invalid");
      }

      return Object.freeze({
        keyVersion,
        hash: createHmac("sha256", key)
          .update(RECOVERY_ACTOR_DOMAIN)
          .update(uid)
          .digest("base64url"),
      });
    }),
  );
}

/**
 * Internal test seam. Production imports are restricted to owner-mutation-actor.ts.
 *
 * @template T
 * @param {{
 *   getUser: () => Promise<{data?: {user?: {id?: string} | null}, error?: unknown}>,
 *   loadKeyring: () => {readers: ReadonlyArray<{keyVersion: string, key: Uint8Array}>},
 *   callback: (context: {actor: {uid: string, recoveryActorCandidates: ReadonlyArray<{keyVersion: string, hash: string}>}, signal: AbortSignal}) => Promise<T>,
 *   startedAt: number,
 *   now?: () => number,
 *   deadlineMs?: number,
 * }} input
 */
export async function executeOwnerMutationActor(input) {
  const now = input.now ?? (() => performance.now());
  const deadlineMs = input.deadlineMs ?? 30_000;
  const authResult = await input.getUser();
  const uid = authResult?.data?.user?.id;

  if (authResult?.error || !uid) {
    throw new Error("Owner authentication is unavailable");
  }

  const keyring = input.loadKeyring();
  const actor = Object.freeze({
    uid,
    recoveryActorCandidates: deriveRecoveryActorCandidates(
      uid,
      keyring.readers,
    ),
  });
  const remainingMs = Math.floor(deadlineMs - (now() - input.startedAt));

  if (remainingMs <= 0) {
    throw new Error("Owner mutation deadline exceeded");
  }

  return input.callback({
    actor,
    signal: AbortSignal.timeout(remainingMs),
  });
}
