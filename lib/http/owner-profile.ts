import "server-only";

import {
  getAuthenticatedOwnerProfile,
  recordAuthenticatedOwnerProfileEvent,
} from "../db/internal-rpc.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

export async function readOwnerProfileResponse(input: {
  playId: string;
  signal: AbortSignal;
}) {
  const result = await getAuthenticatedOwnerProfile({
    playId: input.playId,
  }).catch(() => null);
  if (!result) return ownerNotFoundResponse();
  if (result.outcome === "authorized") {
    return privateNoStore(Response.json(result.profile));
  }
  return ownerNotFoundResponse();
}

export async function recordOwnerProfileEventResponse(input: {
  playId: string;
  event: "profile_viewed" | "profile_reshare_clicked";
  signal: AbortSignal;
}) {
  const result = await recordAuthenticatedOwnerProfileEvent({
    playId: input.playId,
    event: input.event,
  }).catch(() => null);
  if (!result) return ownerNotFoundResponse();
  if (result.outcome === "recorded") {
    return privateNoStore(new Response(null, { status: 204 }));
  }
  return ownerNotFoundResponse();
}
