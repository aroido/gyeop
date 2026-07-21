import { parseOwnerSignInTarget } from "../../../lib/auth/owner-claim-context-core.mjs";
import { startOwnerGoogleOAuthResponse } from "../../../lib/http/auth-owner.ts";
import { withPublicRequest } from "../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";

export function GET(request: Request) {
  return withPublicRequest(
    request,
    { privateNoStore: true },
    async ({ signal }) => {
      const url = new URL(request.url);
      const entries = [...url.searchParams];
      const playIds = url.searchParams.getAll("playId");
      const returnTargets = url.searchParams.getAll("returnTo");
      if (
        returnTargets.length !== 1 ||
        playIds.length > 1 ||
        entries.length !== returnTargets.length + playIds.length
      ) {
        throw new Error("INVALID_REQUEST");
      }

      let target;
      try {
        target = parseOwnerSignInTarget({
          playId: playIds[0] ?? null,
          returnTo: returnTargets[0],
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

      return startOwnerGoogleOAuthResponse({
        cookie: cookie.outcome === "valid" ? cookie : null,
        ownerId,
        playId: target.playId,
        returnTo: target.returnTo,
        signal,
      });
    },
  );
}
