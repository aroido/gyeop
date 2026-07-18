import { isSharePublicId } from "@/lib/share-links/share-link-state-core.mjs";

import InviteEntry from "./invite-entry";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <InviteEntry publicId={isSharePublicId(publicId) ? publicId : null} />;
}
