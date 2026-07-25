import { notFound } from "next/navigation";

import { loadAuthenticatedOwnerConceptProfile } from "@/lib/http/auth-owner";
import { loadOwnerPublicProfileGate } from "@/lib/http/owner-public-profile";
import { isOwnerPlayId } from "@/lib/owner-play/owner-play-state-core.mjs";
import {
  decodeConceptProfileShareCardModel,
  parseProfileShareSelection,
} from "@/lib/owner-profile/profile-share-card-core.mjs";
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
  const {
    entry_source: entrySource,
    share_concept: shareConcept,
    share_relationship: relationship,
    share_card: cardId,
  } = await searchParams;
  const parsedEntrySource = parseShareEntrySource(entrySource);
  const hasLegacySelection = relationship !== undefined || cardId !== undefined;
  if (shareConcept !== undefined && hasLegacySelection) notFound();

  const parsedSelection = parseProfileShareSelection(relationship, cardId);
  const shareSelection =
    parsedSelection === undefined
      ? undefined
      : parsedEntrySource === "profile_reshare"
        ? parsedSelection
        : null;
  let conceptShareCard = null;
  if (shareConcept !== undefined) {
    if (
      typeof shareConcept !== "string" ||
      parsedEntrySource !== "profile_reshare" ||
      !isOwnerPlayId(playId)
    ) {
      notFound();
    }
    try {
      const [profile, gate] = await Promise.all([
        loadAuthenticatedOwnerConceptProfile(),
        loadOwnerPublicProfileGate(),
      ]);
      const option =
        profile.shareOptions.find(
          (option) =>
            option.conceptId === shareConcept && option.sourcePlayId === playId,
        ) ?? null;
      if (!option || !gate || gate.outcome === "incomplete") notFound();
      conceptShareCard = decodeConceptProfileShareCardModel({
        nickname: gate.nickname,
        axes: option.bundle,
      });
    } catch {
      notFound();
    }
    if (!conceptShareCard) notFound();
  }
  return (
    <ShareLinkManager
      playId={isOwnerPlayId(playId) ? playId : null}
      entrySource={parsedEntrySource}
      shareSelection={shareSelection}
      conceptShareCard={conceptShareCard}
    />
  );
}
