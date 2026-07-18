import { visitorSubmitSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  malformedVisitorResponseCookie,
  submitVisitorAnswers,
  visitorResponseMethodNotAllowed,
} from "../../../../../lib/http/visitor-responses.ts";
import { inviteUnavailableResponse } from "../../../../../lib/http/share-links.ts";
import { isVisitorResponseId } from "../../../../../lib/visitor-response/visitor-context-core.mjs";
import {
  deriveResponseActionRateLimitKey,
  parseVisitorResponseCookie,
} from "../../../../../lib/visitor-response/visitor-session-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: visitorSubmitSchema,
      maximumBodyBytes: 96,
      privateNoStore: true,
    },
    async ({ input, signal }) => {
      if (!input || typeof input.managementSecret !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const managementSecret = input.managementSecret;
      const { id } = await context.params;
      if (!isVisitorResponseId(id)) return inviteUnavailableResponse();
      const cookie = parseVisitorResponseCookie(request.headers.get("cookie"));
      if (cookie.outcome === "malformed") {
        return malformedVisitorResponseCookie();
      }
      if (cookie.outcome !== "valid" || cookie.responseId !== id) {
        return inviteUnavailableResponse();
      }
      return runRateLimitedDomain(
        {
          keyHash: deriveResponseActionRateLimitKey(id, "response_submit"),
          action: "response_submit",
          windowSeconds: 600,
          limit: 10,
          signal,
        },
        () =>
          submitVisitorAnswers({
            cookie,
            managementSecret,
            signal,
          }),
      );
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
