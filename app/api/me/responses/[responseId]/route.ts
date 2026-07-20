import {
  privateOneToOneMethodNotAllowed,
  readPrivateOneToOneComparisonResponse,
} from "../../../../../lib/http/private-one-to-one.ts";
import { ownerNotFoundResponse } from "../../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../../lib/owner-play/owner-play-session-core.mjs";
import { isVisitorResponseId } from "../../../../../lib/visitor-response/visitor-context-core.mjs";

export function GET(
  request: Request,
  context: { params: Promise<{ responseId: string }> },
) {
  return withPublicRequest(
    request,
    { privateNoStore: true },
    ({ networkKey, signal }) =>
      runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        async () => {
          const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
          if (cookie.outcome === "absent") return ownerNotFoundResponse();
          if (cookie.outcome === "malformed") {
            return ownerNotFoundResponse(true);
          }
          const { responseId } = await context.params;
          if (!isVisitorResponseId(responseId)) return ownerNotFoundResponse();
          return readPrivateOneToOneComparisonResponse({
            cookie,
            responseId,
            signal,
          });
        },
      ),
  );
}

export {
  privateOneToOneMethodNotAllowed as DELETE,
  privateOneToOneMethodNotAllowed as HEAD,
  privateOneToOneMethodNotAllowed as OPTIONS,
  privateOneToOneMethodNotAllowed as PATCH,
  privateOneToOneMethodNotAllowed as POST,
  privateOneToOneMethodNotAllowed as PUT,
};
