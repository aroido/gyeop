import { recordOwnerProfileEventResponse } from "../../../../../lib/http/owner-profile.ts";
import { ownerNotFoundResponse } from "../../../../../lib/http/owner-play.ts";
import { ownerProfileEventSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../../lib/owner-play/owner-play-session-core.mjs";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: ownerProfileEventSchema,
      maximumBodyBytes: 64,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) => {
      const event = input?.event;
      if (event !== "profile_viewed" && event !== "profile_reshare_clicked") {
        throw new Error("INTERNAL_ERROR");
      }
      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      if (cookie.outcome === "absent") return ownerNotFoundResponse();
      if (cookie.outcome === "malformed") return ownerNotFoundResponse(true);
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
            cookie,
            event,
            signal,
          }),
      );
    },
  );
}
