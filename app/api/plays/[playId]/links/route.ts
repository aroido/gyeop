import { createShareLinkResponse } from "../../../../../lib/http/share-links.ts";
import { createShareLinkSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { ownerNotFoundResponse } from "../../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import { isOwnerPlayId } from "../../../../../lib/owner-play/owner-play-state-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ playId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: createShareLinkSchema,
      maximumBodyBytes: 64,
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
          if (
            !input ||
            (input.kind !== "public" && input.kind !== "one_to_one")
          ) {
            throw new Error("INTERNAL_ERROR");
          }
          const { playId } = await context.params;
          if (!isOwnerPlayId(playId)) {
            return ownerNotFoundResponse();
          }
          return createShareLinkResponse({
            playId,
            kind: input.kind,
            signal,
          });
        },
      ),
  );
}
