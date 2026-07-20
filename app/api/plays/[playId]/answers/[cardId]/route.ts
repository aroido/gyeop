import {
  ownerNotFoundResponse,
  saveOwnerAnswerResponse,
} from "../../../../../../lib/http/owner-play.ts";
import { saveOwnerAnswerSchema } from "../../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../../../lib/owner-play/owner-play-session-core.mjs";
import { isOwnerPlayId } from "../../../../../../lib/owner-play/owner-play-state-core.mjs";

export function PUT(
  request: Request,
  context: { params: Promise<{ playId: string; cardId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: saveOwnerAnswerSchema,
      maximumBodyBytes: 96,
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
            (input.choice !== "a" && input.choice !== "b") ||
            typeof input.currentPosition !== "number" ||
            !Number.isInteger(input.currentPosition)
          ) {
            throw new Error("INTERNAL_ERROR");
          }
          const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
          if (cookie.outcome === "absent") return ownerNotFoundResponse();
          if (cookie.outcome === "malformed")
            return ownerNotFoundResponse(true);
          const { playId, cardId } = await context.params;
          if (!isOwnerPlayId(playId)) return ownerNotFoundResponse();
          return saveOwnerAnswerResponse({
            cookie,
            playId,
            cardId,
            choice: input.choice,
            currentPosition: input.currentPosition,
            signal,
          });
        },
      ),
  );
}
