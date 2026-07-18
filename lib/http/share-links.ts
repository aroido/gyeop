import "server-only";

import {
  disableShareLink,
  getInviteMetadata,
  listOwnerShareLinks,
  recordOwnerShareAction,
} from "../db/internal-rpc.ts";
import { serializeOwnerCookie } from "../owner-play/owner-play-session-core.mjs";
import type { ParsedOwnerCookie } from "../owner-play/owner-play-session.ts";
import { hashShareSecret } from "../share-links/share-link-session-core.mjs";
import {
  createShareLinkWithCredential,
  rotateShareLinkWithCredential,
} from "../share-links/share-links.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

type OwnerCookie = Extract<ParsedOwnerCookie, { outcome: "valid" }>;

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

function renewOwnerCookie<
  T extends { managementExpiresAt: string; managementTtlSeconds: number },
>(response: Response, cookie: OwnerCookie, result: T) {
  response.headers.set(
    "Set-Cookie",
    serializeOwnerCookie(
      cookie.value,
      result.managementTtlSeconds,
      result.managementExpiresAt,
    ),
  );
  return response;
}

function ownerFailure(outcome: string) {
  if (outcome === "expired" || outcome === "not_found") {
    return ownerNotFoundResponse(true);
  }
  return ownerNotFoundResponse();
}

export async function createShareLinkResponse(input: {
  cookie: OwnerCookie;
  kind: "public" | "one_to_one";
  signal: AbortSignal;
}) {
  const result = await createShareLinkWithCredential({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    kind: input.kind,
    signal: input.signal,
  });
  if (result.outcome !== "created") return ownerFailure(result.outcome);
  return renewOwnerCookie(
    ownerJson({ link: result.link, inviteUrl: result.inviteUrl }, 201),
    input.cookie,
    result,
  );
}

export async function listShareLinksResponse(input: {
  cookie: OwnerCookie;
  signal: AbortSignal;
}) {
  const result = await listOwnerShareLinks({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  if (result.outcome !== "listed") return ownerFailure(result.outcome);
  return renewOwnerCookie(
    ownerJson({ links: result.links }),
    input.cookie,
    result,
  );
}

export async function disableShareLinkResponse(input: {
  cookie: OwnerCookie;
  linkId: string;
  signal: AbortSignal;
}) {
  const result = await disableShareLink({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    linkId: input.linkId,
    signal: input.signal,
  });
  if (result.outcome !== "disabled") return ownerFailure(result.outcome);
  return renewOwnerCookie(
    ownerJson({ link: result.link }),
    input.cookie,
    result,
  );
}

export async function rotateShareLinkResponse(input: {
  cookie: OwnerCookie;
  linkId: string;
  signal: AbortSignal;
}) {
  const result = await rotateShareLinkWithCredential({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    linkId: input.linkId,
    signal: input.signal,
  });
  if (result.outcome === "link_not_active") {
    return ownerJson(LINK_NOT_ACTIVE, 409);
  }
  if (result.outcome !== "rotated") return ownerFailure(result.outcome);
  return renewOwnerCookie(
    ownerJson({ link: result.link, inviteUrl: result.inviteUrl }, 201),
    input.cookie,
    result,
  );
}

export async function recordShareActionResponse(input: {
  cookie: OwnerCookie;
  linkId: string;
  event: "share_handoff_succeeded" | "share_link_copied";
  signal: AbortSignal;
}) {
  const result = await recordOwnerShareAction({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    linkId: input.linkId,
    event: input.event,
    signal: input.signal,
  });
  if (result.outcome !== "recorded") return ownerFailure(result.outcome);
  return renewOwnerCookie(
    privateNoStore(new Response(null, { status: 204 })),
    input.cookie,
    result,
  );
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
