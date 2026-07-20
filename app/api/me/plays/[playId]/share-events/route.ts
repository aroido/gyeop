import { recordShareActionResponse } from "../../../../../../lib/http/share-links.ts";
import { recordShareActionSchema } from "../../../../../../lib/http/owner-play-schemas.ts";
import { ownerNotFoundResponse } from "../../../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../../lib/http/request-boundary.ts";
import { isOwnerPlayId } from "../../../../../../lib/owner-play/owner-play-state-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ playId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: recordShareActionSchema,
      maximumBodyBytes: 256,
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
            (input.event !== "share_handoff_succeeded" &&
              input.event !== "share_link_copied") ||
            typeof input.linkId !== "string"
          ) {
            throw new Error("INTERNAL_ERROR");
          }
          const entrySource =
            input.entrySource === "profile_reshare" ? "profile_reshare" : null;
          const { playId } = await context.params;
          if (!isOwnerPlayId(playId)) {
            return ownerNotFoundResponse();
          }
          return recordShareActionResponse({
            playId,
            linkId: input.linkId,
            event: input.event,
            entrySource,
            signal,
          });
        },
      ),
  );
}
