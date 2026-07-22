import { saveOwnerPublicProfileResponse } from "../../../../lib/http/owner-public-profile.ts";
import { ownerPublicProfileSchema } from "../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";

export function PATCH(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: ownerPublicProfileSchema,
      maximumBodyBytes: 128,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) => {
      if (!input || typeof input.nickname !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const nickname = input.nickname;
      return runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        () => saveOwnerPublicProfileResponse({ nickname }),
      );
    },
  );
}
