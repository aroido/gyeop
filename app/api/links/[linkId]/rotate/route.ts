import { emptyOwnerMutationSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { ownerNotFoundResponse } from "../../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import { rotateShareLinkResponse } from "../../../../../lib/http/share-links.ts";
import { parseOwnerCookieHeader } from "../../../../../lib/owner-play/owner-play-session-core.mjs";
import { isShareLinkId } from "../../../../../lib/share-links/share-link-state-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ linkId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: emptyOwnerMutationSchema,
      maximumBodyBytes: 16,
      privateNoStore: true,
    },
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
          if (cookie.outcome === "absent") return ownerNotFoundResponse();
          if (cookie.outcome === "malformed")
            return ownerNotFoundResponse(true);
          const { linkId } = await context.params;
          if (!isShareLinkId(linkId)) return ownerNotFoundResponse();
          return rotateShareLinkResponse({ cookie, linkId, signal });
        },
      ),
  );
}
