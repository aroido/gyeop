import { listAuthenticatedOwnerPlaysResponse } from "../../../../lib/http/auth-owner.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";

export function GET(request: Request) {
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
        () => listAuthenticatedOwnerPlaysResponse(),
      ),
  );
}
