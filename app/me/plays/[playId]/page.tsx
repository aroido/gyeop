import { notFound } from "next/navigation";

import { loadAuthenticatedOwnerConceptProfile } from "@/lib/http/auth-owner";
import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import { parseShareEntrySource } from "@/lib/share-links/share-link-state-core.mjs";

import ShareLinkManager from "./share-link-manager";

export default async function ShareLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ playId: string }>;
  searchParams: Promise<{
    entry_source?: string | string[];
    share_concept?: string | string[];
    share_relationship?: string | string[];
    share_card?: string | string[];
  }>;
}) {
  const { playId } = await params;
  const { entry_source: entrySource, share_concept: shareConcept } =
    await searchParams;
  const parsedEntrySource = parseShareEntrySource(entrySource);
  let conceptShareOption = null;
  if (shareConcept !== undefined) {
    if (
      typeof shareConcept !== "string" ||
      parsedEntrySource !== "profile_reshare" ||
      !isOwnerPlayId(playId)
    ) {
      notFound();
    }
    try {
      const profile = await loadAuthenticatedOwnerConceptProfile();
      conceptShareOption =
        profile.shareOptions.find(
          (option) =>
            option.conceptId === shareConcept &&
            option.sourcePlayId === playId &&
            option.shareEvidence.status === "available",
        ) ?? null;
    } catch {
      notFound();
    }
    if (!conceptShareOption) notFound();
  }
  return (
    <ShareLinkManager
      playId={isOwnerPlayId(playId) ? playId : null}
      entrySource={parsedEntrySource}
      conceptShareOption={conceptShareOption}
    />
  );
}
