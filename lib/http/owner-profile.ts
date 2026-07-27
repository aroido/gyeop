import "server-only";

import {
  getAuthenticatedOwnerProfile,
  recordAuthenticatedOwnerProfileEvent,
} from "../db/internal-rpc.ts";
import { conceptProfileEnabled } from "../owner-profile/concept-profile-feature.mjs";
import { loadAuthenticatedOwnerConceptProfile } from "./auth-owner.ts";
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
  event:
    | "profile_viewed"
    | "profile_reshare_clicked"
    | "concept_profile_viewed"
    | "concept_detail_opened";
  conceptId?: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    const validatesConcept =
      input.event === "concept_profile_viewed" ||
      input.event === "concept_detail_opened" ||
      (input.event === "profile_reshare_clicked" &&
        input.conceptId !== undefined);
    if (validatesConcept) {
      if (!conceptProfileEnabled()) return ownerNotFoundResponse();
      const profile = await loadAuthenticatedOwnerConceptProfile();
      const eligible =
        input.event === "concept_profile_viewed"
          ? profile.hooks[0]?.profileSourcePlayId === input.playId
          : input.event === "concept_detail_opened"
            ? profile.hooks.some(
                (hook) =>
                  hook.profileSourcePlayId === input.playId &&
                  hook.conceptId === input.conceptId,
              )
            : profile.shareOptions.some(
                (option) =>
                  option.sourcePlayId === input.playId &&
                  option.conceptId === input.conceptId,
              );
      if (!eligible) return ownerNotFoundResponse();
    }
    result = await recordAuthenticatedOwnerProfileEvent({
      playId: input.playId,
      event: input.event,
      conceptId: input.conceptId,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome === "recorded") {
    return privateNoStore(new Response(null, { status: 204 }));
  }
  return ownerNotFoundResponse();
}
