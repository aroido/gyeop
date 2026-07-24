import "server-only";

import { loadAuthenticatedOwnerConceptProfile } from "./auth-owner.ts";
import { authenticatedOwnerFailureResponse } from "./auth-errors.ts";
import { privateNoStore } from "./owner-play.ts";

export async function readOwnerConceptProfileResponse() {
  try {
    const profile = await loadAuthenticatedOwnerConceptProfile();
    return privateNoStore(Response.json(profile));
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return privateNoStore(
        Response.json(
          { code: "NOT_FOUND", message: "찾을 수 없습니다." },
          { status: 404 },
        ),
      );
    }
    return authenticatedOwnerFailureResponse(error);
  }
}
