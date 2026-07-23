import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import { parseProfileShareSelection } from "@/lib/owner-profile/profile-share-card-core.mjs";

import OwnerProfileView from "../../owner-profile-view";

export default async function OwnerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{
    share_relationship?: string | string[];
    share_card?: string | string[];
  }>;
}) {
  const { playId } = await params;
  const { share_relationship: relationship, share_card: cardId } =
    await searchParams;
  return (
    <OwnerProfileView
      playId={isOwnerPlayId(playId) ? playId : null}
      initialShareSelection={parseProfileShareSelection(relationship, cardId)}
    />
  );
}
