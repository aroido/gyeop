import {
  OWNER_CLAIM_COOKIE_NAME,
  parseNamedCookie,
  parseOwnerClaimContext,
  serializeDeletedOwnerClaimCookie,
} from "../../../lib/auth/owner-claim-context-core.mjs";
import { completeOwnerAuthentication } from "../../../lib/http/auth-owner.ts";
import { validateAppUrl } from "../../../lib/http/http-boundary-core.mjs";
import { withPublicRequest } from "../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../lib/owner-play/owner-play-session-core.mjs";
import { parseRateLimitSecret } from "../../../lib/security/network-key.mjs";

function redirect(path: string) {
  const appUrl = validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
  const response = new Response(null, {
    status: 303,
    headers: { Location: new URL(path, appUrl).toString() },
  });
  response.headers.append("Set-Cookie", serializeDeletedOwnerClaimCookie());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function GET(request: Request) {
  return withPublicRequest(request, { privateNoStore: true }, async () => {
    const url = new URL(request.url);
    if (
      [...url.searchParams].length !== 1 ||
      url.searchParams.getAll("code").length !== 1
    ) {
      return redirect("/auth/sign-in?error=callback");
    }
    const code = url.searchParams.get("code");
    const contextValue = parseNamedCookie(
      request.headers.get("cookie"),
      OWNER_CLAIM_COOKIE_NAME,
    );
    if (!code || !contextValue) {
      return redirect("/auth/sign-in?error=callback");
    }

    let context;
    try {
      context = parseOwnerClaimContext(
        contextValue,
        parseRateLimitSecret(process.env.RATE_LIMIT_SECRET),
      );
    } catch {
      return redirect("/auth/sign-in?error=callback");
    }

    const ownerCookie = parseOwnerCookieHeader(request.headers.get("cookie"));
    const result = await completeOwnerAuthentication({
      code,
      context,
      cookie: ownerCookie.outcome === "valid" ? ownerCookie : null,
    });
    if (result.outcome === "callback_failed") {
      return redirect("/auth/sign-in?error=callback");
    }
    if (result.outcome === "claim_failed") {
      return redirect("/auth/sign-in?error=claim");
    }
    if (!result.profileComplete) {
      const query = new URLSearchParams({ returnTo: result.returnTo });
      return redirect(`/auth/complete-profile?${query.toString()}`);
    }
    return redirect(result.returnTo);
  });
}
