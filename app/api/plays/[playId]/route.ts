import {
  ownerNotFoundResponse,
  readOwnerPlayResponse,
} from "../../../../lib/http/owner-play.ts";
import { readAuthenticatedOwnerPlayResponse } from "../../../../lib/http/auth-owner.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../lib/owner-play/owner-play-session-core.mjs";
import { isOwnerPlayId } from "../../../../lib/owner-play/owner-play-state-core.mjs";

export function GET(
  request: Request,
  context: { params: Promise<{ playId: string }> },
) {
  return withPublicRequest(
    request,
    { privateNoStore: true },
    ({ networkKey, signal }) =>
      runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        async () => {
          const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
          const { playId } = await context.params;
          if (!isOwnerPlayId(playId)) return ownerNotFoundResponse();
          if (cookie.outcome === "absent") {
            return readAuthenticatedOwnerPlayResponse({ playId });
          }
          if (cookie.outcome === "malformed")
            return ownerNotFoundResponse(true);
          return readOwnerPlayResponse({ cookie, playId, signal });
        },
      ),
  );
}
