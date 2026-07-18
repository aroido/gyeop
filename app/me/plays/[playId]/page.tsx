import { getPackPresentation } from "@/lib/packs/presentation";
import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";

import ShareLinkManager from "./share-link-manager";

export default async function ShareLinksPage({
  params,
}: {
  params: Promise<{ playId: string }>;
}) {
  const { playId } = await params;
  return (
    <ShareLinkManager
      playId={isOwnerPlayId(playId) ? playId : null}
      defaultShareKind={getPackPresentation("old-friend").defaultShareKind}
    />
  );
}
