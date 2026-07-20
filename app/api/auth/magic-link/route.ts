import {
  deriveMagicLinkRateLimitKey,
  parseOwnerReturnTo,
} from "../../../../lib/auth/owner-claim-context-core.mjs";
import { sendOwnerMagicLinkResponse } from "../../../../lib/http/auth-owner.ts";
import { magicLinkSchema } from "../../../../lib/http/auth-schemas.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../lib/owner-play/owner-play-session-core.mjs";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: magicLinkSchema,
      maximumBodyBytes: 512,
      privateNoStore: true,
    },
    async ({ input, networkKey, signal }) => {
      if (
        !input ||
        typeof input.email !== "string" ||
        (input.playId !== null && typeof input.playId !== "string") ||
        typeof input.returnTo !== "string"
      ) {
        throw new Error("INTERNAL_ERROR");
      }

      let returnTo: string;
      const email = input.email;
      const playId = input.playId;
      try {
        returnTo = parseOwnerReturnTo(input.returnTo);
      } catch {
        throw new Error("INVALID_REQUEST");
      }

      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      let ownerId: string | null = null;
      if (playId !== null) {
        if (returnTo !== `/me/plays/${playId}` || cookie.outcome !== "valid") {
          throw new Error("INVALID_REQUEST");
        }
        ownerId = cookie.playId;
      } else if (returnTo !== "/me") {
        throw new Error("INVALID_REQUEST");
      }

      return runRateLimitedDomain(
        {
          keyHash: deriveMagicLinkRateLimitKey(networkKey, ownerId),
          action: "magic_link_send",
          windowSeconds: 3600,
          limit: 5,
          signal,
        },
        () =>
          sendOwnerMagicLinkResponse({
            cookie: cookie.outcome === "valid" ? cookie : null,
            email,
            ownerId,
            playId,
            returnTo,
            signal,
          }),
      );
    },
  );
}
