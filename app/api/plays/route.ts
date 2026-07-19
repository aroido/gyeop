import {
  createOwnerPlayResponse,
  ownerNotFoundResponse,
  resumeOwnerPlayResponse,
} from "../../../lib/http/owner-play.ts";
import { createOwnerPlaySchema } from "../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";
import { parseVisitorResponseCookie } from "../../../lib/visitor-response/visitor-session-core.mjs";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: createOwnerPlaySchema,
      maximumBodyBytes: 128,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) => {
      if (
        !input ||
        typeof input.packSlug !== "string" ||
        (input.entrySource !== "home" && input.entrySource !== "same_pack_cta")
      ) {
        throw new Error("INTERNAL_ERROR");
      }
      const packSlug = input.packSlug;
      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      if (cookie.outcome === "absent") {
        if (input.eligibilityConfirmed !== true) {
          throw new Error("INVALID_INPUT");
        }
        const responseCookie = parseVisitorResponseCookie(
          request.headers.get("cookie"),
        );
        const samePackSource =
          input.entrySource === "same_pack_cta" &&
          responseCookie.outcome === "valid";
        return createOwnerPlayResponse({
          packSlug,
          networkKey,
          entrySource: samePackSource ? "same_pack_cta" : "home",
          sourceResponse: samePackSource
            ? {
                responseId: responseCookie.responseId,
                sessionTokenHash: responseCookie.sessionTokenHash,
              }
            : undefined,
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
      );
    },
  );
}
