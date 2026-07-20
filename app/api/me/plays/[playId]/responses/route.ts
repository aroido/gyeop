import {
  listPrivateOneToOneResponsesResponse,
  privateOneToOneInvalidRequest,
  privateOneToOneMethodNotAllowed,
} from "../../../../../../lib/http/private-one-to-one.ts";
import { ownerNotFoundResponse } from "../../../../../../lib/http/owner-play.ts";
import { runRateLimitedDomain } from "../../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../../lib/http/request-boundary.ts";
import { isOwnerPlayId } from "../../../../../../lib/owner-play/owner-play-state-core.mjs";

export function GET(
  request: Request,
  context: { params: Promise<{ playId: string }> },
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
          const query = new URL(request.url).searchParams;
          if (
            [...query.entries()].length !== 1 ||
            query.getAll("kind").length !== 1 ||
            query.get("kind") !== "one_to_one"
          ) {
            return privateOneToOneInvalidRequest();
          }
          const { playId } = await context.params;
          if (!isOwnerPlayId(playId)) {
            return ownerNotFoundResponse();
          }
          return listPrivateOneToOneResponsesResponse({
            playId,
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
