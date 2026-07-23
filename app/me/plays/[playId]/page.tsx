import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import { parseProfileShareSelection } from "@/lib/owner-profile/profile-share-card-core.mjs";
import { parseShareEntrySource } from "@/lib/share-links/share-link-state-core.mjs";

import ShareLinkManager from "./share-link-manager";

export default async function ShareLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{
    entry_source?: string | string[];
    share_relationship?: string | string[];
    share_card?: string | string[];
  }>;
}) {
  const { playId } = await params;
  const {
    entry_source: entrySource,
    share_relationship: relationship,
    share_card: cardId,
  } = await searchParams;
  const parsedEntrySource = parseShareEntrySource(entrySource);
  const parsedSelection = parseProfileShareSelection(relationship, cardId);
  const shareSelection =
    parsedSelection === undefined
      ? undefined
      : parsedEntrySource === "profile_reshare"
        ? parsedSelection
        : null;
  return (
    <ShareLinkManager
      playId={isOwnerPlayId(playId) ? playId : null}
      entrySource={parsedEntrySource}
      shareSelection={shareSelection}
    />
  );
}
