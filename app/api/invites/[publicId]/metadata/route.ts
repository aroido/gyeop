import { inviteMetadataSchema } from "../../../../../lib/http/owner-play-schemas.ts";
import { withPublicRequest } from "../../../../../lib/http/request-boundary.ts";
import {
  inviteMetadataResponse,
  inviteUnavailableResponse,
} from "../../../../../lib/http/share-links.ts";
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
    async ({ input, signal }) => {
      if (!input || typeof input.secret !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const secret = input.secret;
      const { publicId } = await context.params;
      if (!isSharePublicId(publicId)) {
        return inviteUnavailableResponse();
      }
      return inviteMetadataResponse({ publicId, secret, signal });
    },
  );
}
