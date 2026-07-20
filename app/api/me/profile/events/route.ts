import { recordOwnerProfileEventResponse } from "../../../../../lib/http/owner-profile.ts";
import { ownerProfileEventSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: ownerProfileEventSchema,
      maximumBodyBytes: 128,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) => {
      const event = input?.event;
      const playId = input?.playId;
      if (
        (event !== "profile_viewed" && event !== "profile_reshare_clicked") ||
        typeof playId !== "string"
      ) {
        throw new Error("INTERNAL_ERROR");
      }
      return runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        () =>
          recordOwnerProfileEventResponse({
            playId,
            event,
            signal,
          }),
      );
    },
  );
}
