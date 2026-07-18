import {
  createOwnerPlayResponse,
  ownerNotFoundResponse,
  privateNoStore,
  resumeOwnerPlayResponse,
} from "../../../lib/http/owner-play.ts";
import { createOwnerPlaySchema } from "../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    { schema: createOwnerPlaySchema, maximumBodyBytes: 128 },
    ({ input, networkKey, signal }) => {
      if (!input || typeof input.packSlug !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const packSlug = input.packSlug;
      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      if (cookie.outcome === "absent") {
        return createOwnerPlayResponse({
          packSlug,
          networkKey,
          signal,
        });
      }
      if (cookie.outcome === "malformed") return ownerNotFoundResponse(true);

      return runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        () =>
          resumeOwnerPlayResponse({
            packSlug,
            cookie,
            networkKey,
            signal,
          }),
      ).then(privateNoStore);
    },
  );
}
