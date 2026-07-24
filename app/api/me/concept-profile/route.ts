import { readOwnerConceptProfileResponse } from "@/lib/http/owner-concept-profile";
import { runRateLimitedDomain } from "@/lib/http/rate-limit";
import { withPublicRequest } from "@/lib/http/request-boundary";

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
        readOwnerConceptProfileResponse,
      ),
  );
}
