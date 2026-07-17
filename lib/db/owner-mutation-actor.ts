import "server-only";

import { createFreshServerAuthClient } from "@/lib/auth/server-auth";
import { parseAccountDeleteKeyring } from "@/lib/security/account-delete-keyring.mjs";

import { executeOwnerMutationActor } from "./owner-mutation-actor-core.mjs";

type OwnerMutationActor = Readonly<{
  uid: string;
  recoveryActorCandidates: ReadonlyArray<
    Readonly<{ keyVersion: string; hash: string }>
  >;
}>;

type OwnerMutationContext = Readonly<{
  actor: OwnerMutationActor;
  signal: AbortSignal;
}>;

export async function withOwnerMutationActor<T>(
  callback: (context: OwnerMutationContext) => Promise<T>,
) {
  const startedAt = performance.now();
  const auth = await createFreshServerAuthClient();

  return executeOwnerMutationActor({
    startedAt,
    getUser: () => auth.auth.getUser(),
    loadKeyring: () => parseAccountDeleteKeyring(process.env),
    callback,
  }) as Promise<T>;
}
