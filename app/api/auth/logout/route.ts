import { signOutOwnerAccountResponse } from "../../../../lib/http/auth-owner.ts";
import { emptyOwnerMutationSchema } from "../../../../lib/http/owner-play-schemas.ts";
import { privateNoStore } from "../../../../lib/http/owner-play.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: emptyOwnerMutationSchema,
      maximumBodyBytes: 16,
      privateNoStore: true,
    },
    () => signOutOwnerAccountResponse(),
  );
}

export function GET(request: Request) {
  return withPublicRequest(request, { privateNoStore: true }, () =>
    privateNoStore(
      new Response(null, {
        status: 405,
        headers: { Allow: "POST" },
      }),
    ),
  );
}
