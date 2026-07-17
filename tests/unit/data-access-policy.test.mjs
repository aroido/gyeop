import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  collectRepositoryPolicyFiles,
  verifyDataAccessFiles,
  verifyOwnerMutationSql,
  verifySecurityDefinerSql,
} from "../../scripts/verify-data-access.mjs";

const root = path.resolve(new URL("../../", import.meta.url).pathname);
const internalPath = "lib/db/internal-rpc.ts";

async function fixtureFiles() {
  return collectRepositoryPolicyFiles(root);
}

test("accepts the repository server-only RPC boundary", async () => {
  assert.deepEqual(verifyDataAccessFiles(await fixtureFiles()), []);
});

test("rejects secret use, direct tables, actor imports, and raw client exports", async () => {
  const files = await fixtureFiles();
  files["lib/leaked-secret.ts"] =
    'const key = process.env.SUPABASE_SECRET_KEY; db.from("events"); db["from"]("events");';
  files["app/api/leaked-actor.ts"] =
    'import { withOwnerMutationActor } from "@/lib/db/owner-mutation-actor";';
  files[internalPath] += "\nexport const leakedClient = getInternalClient();\n";

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /SUPABASE_SECRET_KEY is restricted/);
  assert.match(findings, /direct table access is forbidden/);
  assert.match(findings, /owner actor internals cannot be imported/);
  assert.match(findings, /exported runtime variables are forbidden/);
});

test("rejects raw internal client re-exports", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export { getInternalClient };
export default getInternalClient;
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /runtime re-exports and default exports are forbidden/,
  );
});

test("rejects CommonJS internal client exports", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
module.exports = { getInternalClient };
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /CommonJS runtime exports are forbidden/,
  );
});

test("checks executable source outside app and lib", async () => {
  const files = await fixtureFiles();
  files["components/leak.tsx"] =
    'const key = process.env.SUPABASE_SECRET_KEY; export const leak = db.from("analytics_events");';

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /components\/leak\.tsx: SUPABASE_SECRET_KEY/);
  assert.match(findings, /components\/leak\.tsx: direct table access/);
});

test("rejects non-allowlisted and dynamic Auth Admin access", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function unsafeAdmin() {
  const method = "listUsers";
  await getInternalClient().auth.admin[method]();
  return getInternalClient().auth.admin.listUsers();
}
`;

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /dynamic auth.admin access is forbidden/);
  assert.match(findings, /auth.admin.listUsers is outside its named wrapper/);
  assert.match(findings, /unsafeAdmin is not allowlisted/);
});

test("rejects destructured Auth Admin aliases", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function unsafeAdmin() {
  const { admin: hiddenAdmin } = getInternalClient().auth;
  return hiddenAdmin.listUsers();
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /internal clients cannot be aliased or dynamically accessed/,
  );
});

test("rejects element-access RPC allowlist bypasses", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  return getInternalClient()["rpc"]("arbitrary_mutation", { jobId, proof });
}
`;

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /dynamic RPC access is forbidden/);
  assert.match(findings, /RPC arbitrary_mutation is not allowlisted/);
});

test("requires job-bound delete preparation and literal hard delete", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, true);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /deleteUser requires literal false/,
  );
});

test("rejects raw UID wrapper input and unguarded recipient lookup", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof, uid }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.status === "prepared" && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(uid, false);
  }
}
export async function resolveNotificationRecipient({ jobId, proof }) {
  await getInternalClient().rpc("resolve_notification_recipient_identity", { jobId, proof });
  return getInternalClient().auth.admin.getUserById("arbitrary");
}
`;

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /must accept only \{ jobId, proof \}/);
  assert.match(findings, /getUserById must be dominated/);
});

test("accepts structurally guarded named Auth Admin wrappers", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
export async function resolveNotificationRecipient({ jobId, proof }) {
  const { data: identity, error: identityError } = await getInternalClient().rpc("resolve_notification_recipient_identity", { jobId, proof });
  if (!identityError && identity && identity.user_id) {
    return getInternalClient().auth.admin.getUserById(identity.user_id);
  }
}
`;

  assert.deepEqual(verifyDataAccessFiles(files), []);
});

test("requires exact bound RPC provenance and direct Admin calls", async () => {
  const fabricated = await fixtureFiles();
  fabricated[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  const prepareError = undefined;
  const prepared = { allowed: true, call_before: Date.now() + 60_000, uid: jobId };
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(fabricated).join("\n"),
    /must bind one prepare RPC data\/error result/,
  );

  const fallback = await fixtureFiles();
  fallback[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid ?? jobId, false);
  }
}
export async function resolveNotificationRecipient({ jobId, proof }) {
  const { data: identity, error: identityError } = await getInternalClient().rpc("resolve_notification_recipient_identity", { jobId, proof });
  if (!identityError && identity?.user_id) {
    return getInternalClient().auth.admin.getUserById(identity.user_id ?? jobId);
  }
}
`;
  const fallbackFindings = verifyDataAccessFiles(fallback).join("\n");
  assert.match(fallbackFindings, /deleteUser identity must come from/);
  assert.match(fallbackFindings, /getUserById identity must come from/);

  const aliased = await fixtureFiles();
  aliased[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { deleteUser } = getInternalClient().auth.admin;
  return deleteUser(jobId, true);
}
`;
  assert.match(
    verifyDataAccessFiles(aliased).join("\n"),
    /auth\.admin references must be direct allowlisted calls/,
  );
});

test("rejects forged Admin RPC receivers and missing job proof payloads", async () => {
  const forged = await fixtureFiles();
  forged[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const attacker = { rpc: async () => ({ data: { allowed: true, call_before: Date.now() + 60_000, uid: jobId }, error: null }) };
  const { data: prepared, error: prepareError } = await attacker.rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  const forgedFindings = verifyDataAccessFiles(forged).join("\n");
  assert.match(
    forgedFindings,
    /RPC calls must use the internal client directly/,
  );
  assert.match(forgedFindings, /must bind one prepare RPC data\/error result/);

  const emptyPayload = await fixtureFiles();
  emptyPayload[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", {});
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(emptyPayload).join("\n"),
    /must bind one prepare RPC data\/error result/,
  );
});

test("requires Date.now directly for the deletion deadline", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  const now = 0;
  if (!prepareError && prepared.allowed && prepared.call_before > now) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /must be dominated by prepare success and call_before/,
  );
});

test("rejects shadowed Admin provenance and internal client sources", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const realClient = getInternalClient;
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  {
    const prepared = { allowed: true, call_before: Date.now() + 60_000, uid: jobId };
    const prepareError = null;
    if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
      return realClient().auth.admin.deleteUser(prepared.uid, false);
    }
  }
}
`;
  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /cannot shadow or mutate trusted provenance/);
  assert.match(findings, /auth\.admin must use the internal client directly/);
});

test("rejects call-based mutation of trusted Admin results", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  Object.assign(prepared, { allowed: true, call_before: Date.now() + 60_000, uid: "victim" });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot shadow or mutate trusted provenance/,
  );
});

test("rejects destructuring mutation of trusted Admin results", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  ({ uid: prepared.uid, allowed: prepared.allowed, call_before: prepared.call_before } = forged);
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot shadow or mutate trusted provenance/,
  );
});

test("requires exactly one provider call per named Admin wrapper", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
    await getInternalClient().auth.admin.deleteUser(prepared.uid, false);
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /must make exactly one deleteUser provider call/,
  );
});

test("rejects provider calls inside loops", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  for (const item of [1]) {
    if (!prepareError && prepared.allowed && prepared.call_before > Date.now()) {
      return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
    }
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot call the provider inside a loop/,
  );
});

test("rejects table aliases and dynamic owner actor imports", async () => {
  const files = await fixtureFiles();
  files["components/leak.tsx"] =
    'const { from } = db; export const leak = from("analytics_events");';
  files["app/api/leaked-actor.ts"] = `
export async function leak() {
  const { withOwnerMutationActor } = await import("@/lib/db/owner-mutation-actor");
  return withOwnerMutationActor(async ({ actor }) => actor);
}
`;
  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /components\/leak\.tsx: direct table access/);
  assert.match(findings, /owner actor internals cannot be imported/);
});

test("resolves aliased dynamic owner actor import paths", async () => {
  const files = await fixtureFiles();
  files["app/api/aliased-actor.ts"] = `
export async function leak() {
  const path = "@/lib/db/owner-mutation-actor";
  return import(path);
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /owner actor internals cannot be imported/,
  );
});

test("rejects computed table method aliases", async () => {
  const files = await fixtureFiles();
  files["components/computed-leak.tsx"] = `
const method = "from";
export const leak = db[method]("analytics_events");
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /components\/computed-leak\.tsx: direct table access/,
  );
});

test("rejects reflected and reassigned table methods", async () => {
  const files = await fixtureFiles();
  files["components/reflected-leak.tsx"] = `
export const reflected = Reflect.get(db, "from")("analytics_events");
let method = "safe";
method = "from";
export const reassigned = db[method]("analytics_events");
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /components\/reflected-leak\.tsx: direct table access/,
  );
});

test("rejects dynamically joined table methods on client aliases", async () => {
  const files = await fixtureFiles();
  files["components/joined-leak.tsx"] = `
export const leaked = publicDb[["fr", "om"].join("")]("analytics_events");
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /components\/joined-leak\.tsx: direct table access/,
  );
});

test("rejects template-computed table methods", async () => {
  const files = await fixtureFiles();
  files["components/template-leak.tsx"] = `
const suffix = "rom";
const operation = \`f\${suffix}\`;
export const leaked = store[operation]("analytics_events");
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /components\/template-leak\.tsx: direct table access/,
  );
});

test("rejects denied delete branches and arbitrary resolved identities", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function deleteAuthUser({ jobId, proof }) {
  const { data: prepared, error: prepareError } = await getInternalClient().rpc("prepare_auth_deletion_call", { jobId, proof });
  if (!prepareError && !prepared.allowed && prepared.call_before > Date.now()) {
    return getInternalClient().auth.admin.deleteUser(prepared.uid, false);
  }
}
export async function resolveNotificationRecipient({ jobId, proof }) {
  const { data: identity, error: identityError } = await getInternalClient().rpc("resolve_notification_recipient_identity", { jobId, proof });
  if (!identityError && identity?.user_id) {
    return getInternalClient().auth.admin.getUserById("arbitrary");
  }
}
`;
  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /dominated by prepare success/);
  assert.match(findings, /identity must come from the resolved job result/);
});

const guardedOwnerSql = `
create function private.assert_owner_mutation_actor() returns void language plpgsql as $$ begin null; end $$;
create function public.create_share_link(
  p_actor_id uuid,
  p_recovery_actor_candidates jsonb
) returns void language plpgsql as $body$
begin
  perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);
  return;
end
$body$;
`;

test("requires the common owner guard as the first executable SQL statement", () => {
  assert.deepEqual(verifyOwnerMutationSql(guardedOwnerSql), []);

  assert.match(
    verifyOwnerMutationSql(
      guardedOwnerSql.replace(
        "perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);",
        "perform now();\n  perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);",
      ),
    ).join("\n"),
    /must call the owner guard as its first statement/,
  );

  assert.match(
    verifyOwnerMutationSql(
      guardedOwnerSql.replace(
        "perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);",
        "if false then\n    perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);\n  end if;",
      ),
    ).join("\n"),
    /must call the owner guard as its first statement/,
  );
});

test("requires owner actor inputs and the shared guard definition", () => {
  const sql = guardedOwnerSql
    .replace(/create function private[\s\S]*?\$\$;/, "")
    .replace("p_actor_id uuid,", "p_uid uuid,");
  const findings = verifyOwnerMutationSql(sql).join("\n");
  assert.match(findings, /require private.assert_owner_mutation_actor/);
  assert.match(findings, /missing the exact owner actor inputs/);
});

test("rejects owner RPCs that expose actor material", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ actor, signal }) => {
    await getInternalClient().rpc("create_share_link", {}).abortSignal(signal);
    return actor;
  });
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot return owner actor material/,
  );
});

test("rejects injected actor sources and owner RPCs without the deadline signal", async () => {
  const files = await fixtureFiles();
  files["lib/db/owner-mutation-actor.ts"] = files[
    "lib/db/owner-mutation-actor.ts"
  ].replace(
    "callback: (context: OwnerMutationContext) => Promise<T>,",
    "callback: (context: OwnerMutationContext) => Promise<T>, uid: string,",
  );
  files[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ signal }) => {
    return getInternalClient().rpc("create_share_link", {});
  });
}
`;

  const findings = verifyDataAccessFiles(files).join("\n");
  assert.match(findings, /wrapper accepts callback only/);
  assert.match(findings, /must bind the owner deadline signal/);
});

test("requires exact fresh actor values in owner mutation RPC arguments", async () => {
  const forged = await fixtureFiles();
  forged[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ actor, signal }) =>
    getInternalClient().rpc("create_share_link", {
      p_actor_id: "forged",
      p_recovery_actor_candidates: [],
    }).abortSignal(signal),
  );
}
`;
  const findings = verifyDataAccessFiles(forged).join("\n");
  assert.match(findings, /must pass actor.uid as p_actor_id/);
  assert.match(findings, /must pass actor.recoveryActorCandidates/);

  const valid = await fixtureFiles();
  valid[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ actor, signal }) =>
    getInternalClient().rpc("create_share_link", {
      p_actor_id: actor.uid,
      p_recovery_actor_candidates: actor.recoveryActorCandidates,
    }).abortSignal(signal),
  );
}
`;
  assert.deepEqual(verifyDataAccessFiles(valid), []);
});

test("rejects owner wrappers with a forged RPC before the valid RPC", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ actor, signal }) => {
    await getInternalClient().rpc("create_share_link", {
      p_actor_id: "forged",
      p_recovery_actor_candidates: [],
    }).abortSignal(signal);
    return getInternalClient().rpc("create_share_link", {
      p_actor_id: actor.uid,
      p_recovery_actor_candidates: actor.recoveryActorCandidates,
    }).abortSignal(signal);
  });
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /createShareLink must invoke exactly one RPC/,
  );
});

test("rejects cross-wrapper owner mutation invocation", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  await disableShareLink();
  return withOwnerMutationActor(async ({ actor, signal }) =>
    getInternalClient().rpc("create_share_link", {
      p_actor_id: actor.uid,
      p_recovery_actor_candidates: actor.recoveryActorCandidates,
    }).abortSignal(signal),
  );
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot invoke or alias another owner wrapper/,
  );
});

test("requires exactly one owner actor wrapper invocation", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  withOwnerMutationActor(captureOwner);
  return withOwnerMutationActor(async ({ actor, signal }) =>
    getInternalClient().rpc("create_share_link", {
      p_actor_id: actor.uid,
      p_recovery_actor_candidates: actor.recoveryActorCandidates,
    }).abortSignal(signal),
  );
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /must use exactly one fresh actor callback/,
  );
});

test("requires owner actor wrappers at direct function scope", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  return [1, 2].map(() =>
    withOwnerMutationActor(async ({ actor, signal }) =>
      getInternalClient().rpc("create_share_link", {
        p_actor_id: actor.uid,
        p_recovery_actor_candidates: actor.recoveryActorCandidates,
      }).abortSignal(signal),
    ),
  );
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /must use exactly one fresh actor callback/,
  );
});

test("rejects owner mutation calls inside loops", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  for (const item of [1]) {
    return withOwnerMutationActor(async ({ actor, signal }) =>
      getInternalClient().rpc("create_share_link", {
        p_actor_id: actor.uid,
        p_recovery_actor_candidates: actor.recoveryActorCandidates,
      }).abortSignal(signal),
    );
  }
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot run owner mutation calls inside a loop/,
  );
});

test("requires owner RPCs to use the internal client directly", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  const attacker = { rpc: () => ({ abortSignal: async () => ({ data: null }) }) };
  return withOwnerMutationActor(async ({ actor, signal }) =>
    attacker.rpc("create_share_link", {
      p_actor_id: actor.uid,
      p_recovery_actor_candidates: actor.recoveryActorCandidates,
    }).abortSignal(signal),
  );
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /RPC calls must use the internal client directly/,
  );
});

test("rejects shadowed actor values inside owner callbacks", async () => {
  const files = await fixtureFiles();
  files[internalPath] += `
export async function createShareLink() {
  return withOwnerMutationActor(async ({ actor, signal }) => {
    {
      const actor = { uid: "forged", recoveryActorCandidates: [] };
      return getInternalClient().rpc("create_share_link", {
        p_actor_id: actor.uid,
        p_recovery_actor_candidates: actor.recoveryActorCandidates,
      }).abortSignal(signal);
    }
  });
}
`;
  assert.match(
    verifyDataAccessFiles(files).join("\n"),
    /cannot shadow or mutate trusted owner sources/,
  );
});

test("checks the final active owner mutation definition", () => {
  const replaced = `${guardedOwnerSql}
create or replace function public.create_share_link(
  p_actor_id uuid,
  p_recovery_actor_candidates jsonb
) returns void language plpgsql as $body$
begin
  return;
end
$body$;
`;
  assert.match(
    verifyOwnerMutationSql(replaced).join("\n"),
    /must call the owner guard as its first statement/,
  );
});

test("requires exact actor values in the first owner SQL guard call", () => {
  const forged = guardedOwnerSql.replace(
    "p_actor_id, p_recovery_actor_candidates",
    "'00000000-0000-0000-0000-000000000000'::uuid, '[]'::jsonb",
  );
  assert.match(
    verifyOwnerMutationSql(forged).join("\n"),
    /must call the owner guard as its first statement/,
  );
});

test("forbids owner actor input mutation after the SQL guard", () => {
  const mutated = guardedOwnerSql.replace(
    "perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);",
    `perform private.assert_owner_mutation_actor(p_actor_id, p_recovery_actor_candidates);
  p_actor_id := '00000000-0000-0000-0000-000000000000'::uuid;`,
  );
  assert.match(
    verifyOwnerMutationSql(mutated).join("\n"),
    /cannot mutate guarded owner actor inputs/,
  );
});

test("requires schema-qualified relations in every SECURITY DEFINER function", () => {
  const unsafe = `
create function public.future_probe() returns void
language plpgsql security definer set search_path = ''
as $$ begin perform 1 from future_probe; end $$;
`;
  assert.match(
    verifySecurityDefinerSql(unsafe).join("\n"),
    /uses unqualified relation future_probe/,
  );
  assert.deepEqual(
    verifySecurityDefinerSql(
      unsafe.replace("from future_probe", "from public.future_probe"),
    ),
    [],
  );
});
