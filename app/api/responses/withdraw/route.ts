import { visitorWithdrawalSchema } from "../../../../lib/http/owner-play-schemas.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";
import {
  visitorResponseMethodNotAllowed,
  withdrawVisitorResponseByManagementToken,
} from "../../../../lib/http/visitor-responses.ts";

export function POST(request: Request) {
  return withPublicRequest(
    request,
    {
      schema: visitorWithdrawalSchema,
      maximumBodyBytes: 64,
      privateNoStore: true,
    },
    ({ input, networkKey, signal }) => {
      if (!input || typeof input.token !== "string") {
        throw new Error("INTERNAL_ERROR");
      }
      const token = input.token;
      return runRateLimitedDomain(
        {
          keyHash: networkKey,
          action: "response_withdraw",
          windowSeconds: 3600,
          limit: 5,
          signal,
        },
        () => withdrawVisitorResponseByManagementToken({ token, signal }),
      );
    },
  );
}

const methodNotAllowed = () => visitorResponseMethodNotAllowed("POST");
export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as HEAD,
  methodNotAllowed as OPTIONS,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
