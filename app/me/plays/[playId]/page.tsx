import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import { parseShareEntrySource } from "@/lib/share-links/share-link-state-core.mjs";

import ShareLinkManager from "./share-link-manager";

export default async function ShareLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{ entry_source?: string | string[] }>;
}) {
  const { playId } = await params;
  const { entry_source: entrySource } = await searchParams;
  return (
    <ShareLinkManager
      playId={isOwnerPlayId(playId) ? playId : null}
      entrySource={parseShareEntrySource(entrySource)}
    />
  );
}
