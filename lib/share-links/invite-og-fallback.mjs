import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function inviteOgFallbackResponse(root = process.cwd()) {
  const png = await readFile(join(root, "public/og/gyeop-share.png"));
  return new Response(png, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/png",
    },
  });
}
