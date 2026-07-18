import {
  ownerNotFoundResponse,
  privateNoStore,
  readOwnerPlayResponse,
} from "../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../lib/owner-play/owner-play-session-core.mjs";

export function GET(
  request: Request,
  context: { params: Promise<{ playId: string }> },
) {
  return withPublicRequest(request, {}, ({ networkKey, signal }) =>
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
        if (cookie.outcome === "absent") return ownerNotFoundResponse();
        if (cookie.outcome === "malformed") return ownerNotFoundResponse(true);
        const { playId } = await context.params;
        if (cookie.playId !== playId) return ownerNotFoundResponse();
        return readOwnerPlayResponse({ cookie, signal });
      },
    ).then(privateNoStore),
  );
}
