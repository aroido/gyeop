import "server-only";

import {
  getOwnerProfile,
  recordOwnerProfileEvent,
} from "../db/internal-rpc.ts";
import type { ParsedOwnerCookie } from "../owner-play/owner-play-session.ts";
import {
  ownerInternalErrorResponse,
  ownerNotFoundResponse,
  privateNoStore,
  refreshOwnerCookie,
} from "./owner-play.ts";

type ValidOwnerCookie = Extract<ParsedOwnerCookie, { outcome: "valid" }>;

export async function readOwnerProfileResponse(input: {
  cookie: ValidOwnerCookie;
  signal: AbortSignal;
}) {
  const result = await getOwnerProfile({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  if (result.outcome === "authorized") {
    return refreshOwnerCookie(
      privateNoStore(Response.json(result.profile)),
      input.cookie.value,
      result,
    );
  }
  if (result.outcome === "not_completed") {
    return refreshOwnerCookie(
      ownerNotFoundResponse(),
      input.cookie.value,
      result,
    );
  }
  if (result.outcome === "expired" || result.outcome === "not_found") {
    return ownerNotFoundResponse(true);
  }
  return ownerInternalErrorResponse();
}

export async function recordOwnerProfileEventResponse(input: {
  cookie: ValidOwnerCookie;
  event: "profile_viewed";
  signal: AbortSignal;
}) {
  const result = await recordOwnerProfileEvent({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    event: input.event,
    signal: input.signal,
  });
  if (result.outcome === "recorded") {
    return privateNoStore(new Response(null, { status: 204 }));
  }
  if (result.outcome === "expired" || result.outcome === "not_found") {
    return ownerNotFoundResponse(true);
  }
  if (result.outcome === "not_completed") return ownerNotFoundResponse();
  return ownerInternalErrorResponse();
}
