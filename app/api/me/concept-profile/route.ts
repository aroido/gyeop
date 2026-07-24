import { readOwnerConceptProfileResponse } from "@/lib/http/owner-concept-profile";
import { runRateLimitedDomain } from "@/lib/http/rate-limit";
import { withPublicRequest } from "@/lib/http/request-boundary";
import { conceptProfileEnabled } from "@/lib/owner-profile/concept-profile-feature.mjs";

export function GET(request: Request) {
  return withPublicRequest(
    request,
    { privateNoStore: true },
    ({ networkKey, signal }) => {
      if (!conceptProfileEnabled()) {
        return Response.json(
          { code: "NOT_FOUND", message: "찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "owner_play_access",
          windowSeconds: 600,
          limit: 120,
          signal,
        },
        readOwnerConceptProfileResponse,
      );
    },
  );
}
