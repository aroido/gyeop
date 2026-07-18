import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";

import OwnerPlay from "./owner-play";

export default async function OwnerPlayPage({
  params,
}: {
  params: Promise<{ playId: string }>;
}) {
  const { playId } = await params;
  return <OwnerPlay playId={isOwnerPlayId(playId) ? playId : null} />;
}
