import { visitorResponseSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  malformedVisitorResponseCookie,
  visitorResponse,
} from "../../../../../lib/http/visitor-responses.ts";
import { inviteUnavailableResponse } from "../../../../../lib/http/share-links.ts";
import { isSharePublicId } from "../../../../../lib/share-links/share-link-state-core.mjs";
import {
  deriveResponseStartRateLimitKey,
  parseVisitorResponseCookie,
} from "../../../../../lib/visitor-response/visitor-session-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: visitorResponseSchema,
      maximumBodyBytes: 256,
      privateNoStore: true,
    },
    async ({ input, networkKey, signal }) => {
      if (!input || typeof input.secret !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const intent = input.intent;
      const relationshipCode = input.relationshipCode;
      const knownSinceCode = input.knownSinceCode;
      const resume =
        intent === "resume" &&
        relationshipCode === undefined &&
        knownSinceCode === undefined;
      const start =
        intent === "start" &&
        typeof relationshipCode === "string" &&
        typeof knownSinceCode === "string";
      if (!resume && !start) throw new Error("INVALID_INPUT");
      if (intent !== "resume" && intent !== "start") {
        throw new Error("INTERNAL_ERROR");
      }

      const { publicId } = await context.params;
      if (!isSharePublicId(publicId)) return inviteUnavailableResponse();
      const cookie = parseVisitorResponseCookie(request.headers.get("cookie"));
      if (cookie.outcome === "malformed") {
        return malformedVisitorResponseCookie();
      }
      return visitorResponse({
        publicId,
        secret: input.secret,
        intent,
        cookie: cookie.outcome === "valid" ? cookie : undefined,
        relationshipCode:
          typeof relationshipCode === "string" ? relationshipCode : undefined,
        knownSinceCode:
          typeof knownSinceCode === "string" ? knownSinceCode : undefined,
        rateLimitKey: deriveResponseStartRateLimitKey(networkKey, publicId),
        signal,
      });
    },
  );
}
