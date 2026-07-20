import "server-only";

import {
  getAuthenticatedOwnerProfile,
  recordAuthenticatedOwnerProfileEvent,
} from "../db/internal-rpc.ts";
import { authenticatedOwnerFailureResponse } from "./auth-errors.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

export async function readOwnerProfileResponse(input: {
  playId: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await getAuthenticatedOwnerProfile({ playId: input.playId });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
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
  let result;
  try {
    result = await recordAuthenticatedOwnerProfileEvent({
      playId: input.playId,
      event: input.event,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome === "recorded") {
    return privateNoStore(new Response(null, { status: 204 }));
  }
  return ownerNotFoundResponse();
}
