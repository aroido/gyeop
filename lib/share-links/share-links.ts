import "server-only";

import {
  createShareLink as createShareLinkRpc,
  rotateShareLink as rotateShareLinkRpc,
} from "../db/internal-rpc.ts";
import {
  canonicalInviteUrl,
  createShareCredential,
} from "./share-link-session-core.mjs";

const MAX_COLLISION_ATTEMPTS = 3;

function appUrl() {
  const value = process.env.APP_URL;
  if (!value) throw new Error("Missing required server configuration: APP_URL");
  return value;
}

export async function createShareLinkWithCredential(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  kind: "public" | "one_to_one";
  signal?: AbortSignal;
}) {
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const credential = createShareCredential();
    const result = await createShareLinkRpc({ ...input, ...credential });
    if (result.outcome === "collision") continue;
    if (result.outcome !== "created") return result;
    return Object.freeze({
      ...result,
      inviteUrl: canonicalInviteUrl(
        appUrl(),
        credential.publicId,
        credential.secret,
      ),
    });
  }
  throw new Error("Share link credential allocation failed");
}

export async function rotateShareLinkWithCredential(input: {
  playId: string;
  managementSecretHash: Uint8Array;
  linkId: string;
  signal?: AbortSignal;
}) {
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const credential = createShareCredential();
    const result = await rotateShareLinkRpc({
      ...input,
      linkIdNew: credential.linkId,
      publicId: credential.publicId,
      secretHash: credential.secretHash,
    });
    if (result.outcome === "collision") continue;
    if (result.outcome !== "rotated") return result;
    return Object.freeze({
      ...result,
      inviteUrl: canonicalInviteUrl(
        appUrl(),
        credential.publicId,
        credential.secret,
      ),
    });
  }
  throw new Error("Share link credential allocation failed");
}
