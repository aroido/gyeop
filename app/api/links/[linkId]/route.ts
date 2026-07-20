import { playOwnerMutationSchema } from "../../../../lib/http/owner-play-schemas.ts";
import { ownerNotFoundResponse } from "../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { disableShareLinkResponse } from "../../../../lib/http/share-links.ts";
import { isShareLinkId } from "../../../../lib/share-links/share-link-state-core.mjs";

export function PATCH(
  request: Request,
  context: { params: Promise<{ linkId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: playOwnerMutationSchema,
      maximumBodyBytes: 80,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) =>
      runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        async () => {
          if (!input || typeof input.playId !== "string") {
            throw new Error("INTERNAL_ERROR");
          }
          const { linkId } = await context.params;
          if (!isShareLinkId(linkId)) return ownerNotFoundResponse();
          return disableShareLinkResponse({
            playId: input.playId,
            linkId,
            signal,
          });
        },
      ),
  );
}
