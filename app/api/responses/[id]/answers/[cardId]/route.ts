import { visitorAnswerSchema } from "../../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../../lib/http/request-boundary.ts";
import {
  malformedVisitorResponseCookie,
  saveVisitorAnswer,
} from "../../../../../../lib/http/visitor-responses.ts";
import { inviteUnavailableResponse } from "../../../../../../lib/http/share-links.ts";
import { isVisitorResponseId } from "../../../../../../lib/visitor-response/visitor-context-core.mjs";
import {
  deriveResponseActionRateLimitKey,
  parseVisitorResponseCookie,
} from "../../../../../../lib/visitor-response/visitor-session-core.mjs";

const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function PUT(
  request: Request,
  context: { params: Promise<{ id: string; cardId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: visitorAnswerSchema,
      maximumBodyBytes: 64,
      privateNoStore: true,
    },
    async ({ input, signal }) => {
      if (!input || (input.choice !== "a" && input.choice !== "b")) {
        throw new Error("INTERNAL_ERROR");
      }
      const choice = input.choice;
      const { id, cardId } = await context.params;
      if (!isVisitorResponseId(id) || !CARD_ID.test(cardId)) {
        return inviteUnavailableResponse();
      }
      const cookie = parseVisitorResponseCookie(request.headers.get("cookie"));
      if (cookie.outcome === "malformed") {
        return malformedVisitorResponseCookie();
      }
      if (cookie.outcome !== "valid" || cookie.responseId !== id) {
        return inviteUnavailableResponse();
      }
      return runRateLimitedDomain(
        {
          keyHash: deriveResponseActionRateLimitKey(id, "response_answer_save"),
          action: "response_answer_save",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        () =>
          saveVisitorAnswer({
            cookie,
            cardId,
            choice,
            signal,
          }),
      );
    },
  );
}
