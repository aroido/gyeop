import { readOwnerProfileResponse } from "../../../../lib/http/owner-profile.ts";
import { ownerNotFoundResponse } from "../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { isOwnerPlayId } from "../../../../lib/owner-play/owner-play-state-core.mjs";

export function GET(request: Request) {
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
        () => {
          const query = new URL(request.url).searchParams;
          const playId = query.get("playId");
          if (
            [...query.entries()].length !== 1 ||
            query.getAll("playId").length !== 1 ||
            !playId ||
            !isOwnerPlayId(playId)
          ) {
            return ownerNotFoundResponse();
          }
          return readOwnerProfileResponse({ playId, signal });
        },
      ),
  );
}
