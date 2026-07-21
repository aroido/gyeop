import {
  deriveMagicLinkRateLimitKey,
  parseOwnerSignInTarget,
} from "../../../../lib/auth/owner-claim-context-core.mjs";
import { sendOwnerTestMagicLinkResponse } from "../../../../lib/http/auth-owner.ts";
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
        process.env.NODE_ENV === "production" ||
        process.env.GYEOP_E2E_LIVE !== "1"
      ) {
        return new Response(null, { status: 404 });
      }
      if (
        !input ||
        typeof input.email !== "string" ||
        (input.playId !== null && typeof input.playId !== "string") ||
        typeof input.returnTo !== "string"
      ) {
        throw new Error("INTERNAL_ERROR");
      }
      const email = input.email;

      let target;
      try {
        target = parseOwnerSignInTarget({
          playId: input.playId,
          returnTo: input.returnTo,
        });
      } catch {
        throw new Error("INVALID_REQUEST");
      }

      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      const ownerId =
        target.playId !== null && cookie.outcome === "valid"
          ? cookie.playId
          : null;
      if (target.playId !== null && ownerId === null) {
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
          sendOwnerTestMagicLinkResponse({
            cookie: cookie.outcome === "valid" ? cookie : null,
            email,
            ownerId,
            playId: target.playId,
            returnTo: target.returnTo,
            signal,
          }),
      );
    },
  );
}
