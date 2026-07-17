import { readPublishedPack } from "../../../../lib/http/published-pack.ts";
import { runRateLimitedDomain } from "../../../../lib/http/rate-limit.ts";
import { withPublicRequest } from "../../../../lib/http/request-boundary.ts";

const NOT_FOUND = Object.freeze({
  code: "PACK_NOT_FOUND",
  message: "팩을 찾을 수 없습니다.",
});

export function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  return withPublicRequest(request, {}, ({ networkKey, signal }) =>
    runRateLimitedDomain(
      {
        keyHash: networkKey,
        action: "pack_catalog_read",
        windowSeconds: 60,
        limit: 60,
        signal,
      },
      async () => {
        const { slug } = await context.params;
        const pack = await readPublishedPack(slug, signal);
        return pack
          ? Response.json(pack)
          : Response.json(NOT_FOUND, { status: 404 });
      },
    ),
  );
}
