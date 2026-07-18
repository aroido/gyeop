import { visitorEventSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  malformedVisitorResponseCookie,
  recordVisitorResponseScreenEvent,
} from "../../../../../lib/http/visitor-responses.ts";
import { inviteUnavailableResponse } from "../../../../../lib/http/share-links.ts";
import { isVisitorResponseId } from "../../../../../lib/visitor-response/visitor-context-core.mjs";
import { parseVisitorResponseCookie } from "../../../../../lib/visitor-response/visitor-session-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: visitorEventSchema,
      maximumBodyBytes: 64,
      privateNoStore: true,
    },
    async ({ input, signal }) => {
      if (
        !input ||
        (input.event !== "comparison_viewed" &&
          input.event !== "same_pack_start_clicked")
      ) {
        throw new Error("INTERNAL_ERROR");
      }
      const { id } = await context.params;
      if (!isVisitorResponseId(id)) return inviteUnavailableResponse();
      const cookie = parseVisitorResponseCookie(request.headers.get("cookie"));
      if (cookie.outcome === "malformed") {
        return malformedVisitorResponseCookie();
      }
      if (cookie.outcome !== "valid" || cookie.responseId !== id) {
        return inviteUnavailableResponse();
      }
      return recordVisitorResponseScreenEvent({
        cookie,
        event: input.event,
        signal,
      });
    },
  );
}
