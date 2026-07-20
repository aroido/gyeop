import "server-only";

import {
  disableAuthenticatedShareLink,
  getInviteMetadata,
  listAuthenticatedShareLinks,
  recordAuthenticatedOwnerShareAction,
} from "../db/internal-rpc.ts";
import { hashShareSecret } from "../share-links/share-link-session-core.mjs";
import {
  createAuthenticatedShareLinkWithCredential,
  rotateAuthenticatedShareLinkWithCredential,
} from "../share-links/share-links.ts";
import { authenticatedOwnerFailureResponse } from "./auth-errors.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

const LINK_NOT_ACTIVE = Object.freeze({
  code: "SHARE_LINK_NOT_ACTIVE",
  message: "링크 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.",
});
const INVITE_UNAVAILABLE = Object.freeze({
  code: "INVITE_UNAVAILABLE",
  message: "이 초대는 지금 참여할 수 없습니다.",
});

export function inviteUnavailableResponse() {
  return privateNoStore(Response.json(INVITE_UNAVAILABLE, { status: 404 }));
}

function ownerJson(value: unknown, status = 200) {
  return privateNoStore(Response.json(value, { status }));
}

function ownerFailure(outcome: string) {
  if (outcome === "expired" || outcome === "not_found")
    return ownerNotFoundResponse();
  return ownerNotFoundResponse();
}

export async function createShareLinkResponse(input: {
  playId: string;
  kind: "public" | "one_to_one";
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await createAuthenticatedShareLinkWithCredential({
      playId: input.playId,
      kind: input.kind,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "created") return ownerFailure(result.outcome);
  return ownerJson({ link: result.link, inviteUrl: result.inviteUrl }, 201);
}

export async function listShareLinksResponse(input: {
  playId: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await listAuthenticatedShareLinks({ playId: input.playId });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "listed") return ownerFailure(result.outcome);
  return ownerJson({ links: result.links });
}

export async function disableShareLinkResponse(input: {
  playId: string;
  linkId: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await disableAuthenticatedShareLink({
      playId: input.playId,
      linkId: input.linkId,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "disabled") return ownerFailure(result.outcome);
  return ownerJson({ link: result.link });
}

export async function rotateShareLinkResponse(input: {
  playId: string;
  linkId: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await rotateAuthenticatedShareLinkWithCredential({
      playId: input.playId,
      linkId: input.linkId,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome === "link_not_active") {
    return ownerJson(LINK_NOT_ACTIVE, 409);
  }
  if (result.outcome !== "rotated") return ownerFailure(result.outcome);
  return ownerJson({ link: result.link, inviteUrl: result.inviteUrl }, 201);
}

export async function recordShareActionResponse(input: {
  playId: string;
  linkId: string;
  event: "share_handoff_succeeded" | "share_link_copied";
  entrySource: "profile_reshare" | null;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await recordAuthenticatedOwnerShareAction({
      playId: input.playId,
      linkId: input.linkId,
      event: input.event,
      entrySource: input.entrySource,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "recorded") return ownerFailure(result.outcome);
  return privateNoStore(new Response(null, { status: 204 }));
}

export async function inviteMetadataResponse(input: {
  publicId: string;
  secret: string;
  signal: AbortSignal;
}) {
  const result = await getInviteMetadata({
    publicId: input.publicId,
    secretHash: hashShareSecret(input.secret),
    signal: input.signal,
  });
  if (result.outcome !== "active") {
    return inviteUnavailableResponse();
  }
  return privateNoStore(Response.json(result.metadata));
}
