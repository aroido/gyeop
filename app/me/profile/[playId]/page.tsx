import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";

import OwnerProfileView from "../../owner-profile-view";

export default async function OwnerProfilePage({
  params,
}: {
  params: Promise<{ playId: string }>;
}) {
  const { playId } = await params;
  return <OwnerProfileView playId={isOwnerPlayId(playId) ? playId : null} />;
}
