import { getPublishedPack } from "../db/internal-rpc.ts";

export async function readPublishedPack(slug: string, signal?: AbortSignal) {
  return getPublishedPack({ slug, signal });
}
