import { inviteMetadataSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  inviteMetadataResponse,
  inviteUnavailableResponse,
} from "../../../../../lib/http/share-links.ts";
import { deriveInviteRateLimitKey } from "../../../../../lib/share-links/share-link-session-core.mjs";
import { isSharePublicId } from "../../../../../lib/share-links/share-link-state-core.mjs";

export function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  return withPublicRequest(
    request,
    {
      schema: inviteMetadataSchema,
      maximumBodyBytes: 96,
      privateNoStore: true,
    },
    async ({ input, networkKey, signal }) => {
      if (!input || typeof input.secret !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const secret = input.secret;
      const { publicId } = await context.params;
      if (!isSharePublicId(publicId)) {
        return inviteUnavailableResponse();
      }
      return runRateLimitedDomain(
        {
          keyHash: deriveInviteRateLimitKey(networkKey, publicId),
          action: "invite_metadata",
          windowSeconds: 60,
          limit: 60,
          signal,
        },
        () => inviteMetadataResponse({ publicId, secret, signal }),
      );
    },
  );
}
