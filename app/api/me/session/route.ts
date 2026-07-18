import {
  ownerLogoutResponse,
  revokeOwnerPlayResponse,
} from "../../../../lib/http/owner-play.ts";
import { emptyOwnerMutationSchema } from "../../../../lib/http/owner-play-schemas.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import { parseOwnerCookieHeader } from "../../../../lib/owner-play/owner-play-session-core.mjs";

export function DELETE(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: emptyOwnerMutationSchema,
      maximumBodyBytes: 16,
      privateNoStore: true,
    },
    ({ signal }) => {
      const cookie = parseOwnerCookieHeader(request.headers.get("cookie"));
      if (cookie.outcome !== "valid") return ownerLogoutResponse();
      return revokeOwnerPlayResponse({ cookie, signal });
    },
  );
}
