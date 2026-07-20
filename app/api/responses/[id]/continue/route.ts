import { emptyOwnerMutationSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  continueVisitorAnswers,
  malformedVisitorResponseCookie,
  visitorResponseMethodNotAllowed,
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
      schema: emptyOwnerMutationSchema,
      maximumBodyBytes: 2,
      privateNoStore: true,
    },
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
      return continueVisitorAnswers({ cookie, signal });
    },
  );
}

const methodNotAllowed = () => visitorResponseMethodNotAllowed("POST");
export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
