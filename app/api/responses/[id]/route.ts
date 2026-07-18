import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import {
  malformedVisitorResponseCookie,
  readVisitorResponse,
} from "../../../../lib/http/visitor-responses.ts";
import { inviteUnavailableResponse } from "../../../../lib/http/share-links.ts";
import { isVisitorResponseId } from "../../../../lib/visitor-response/visitor-context-core.mjs";
import { parseVisitorResponseCookie } from "../../../../lib/visitor-response/visitor-session-core.mjs";

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withPublicRequest(
    request,
    { privateNoStore: true },
    async ({ signal }) => {
      const { id } = await context.params;
      if (!isVisitorResponseId(id)) return inviteUnavailableResponse();
      const cookie = parseVisitorResponseCookie(request.headers.get("cookie"));
      if (cookie.outcome === "malformed") {
        return malformedVisitorResponseCookie();
      }
      if (cookie.outcome !== "valid" || cookie.responseId !== id) {
        return inviteUnavailableResponse();
      }
      return readVisitorResponse({ cookie, signal });
    },
  );
}
