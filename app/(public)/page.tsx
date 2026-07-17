import { unstable_noStore as noStore } from "next/cache";

import oldFriendManifest from "@/content/packs/old-friend-v1.json";
import { readPublishedPack } from "@/lib/http/published-pack";
import { relationshipLabel, sensitivityLabel } from "@/lib/packs/labels";
import { getPackPresentation } from "@/lib/packs/presentation";

import HomeClient, { type OldFriendSummary } from "./home-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function oldFriendSummary(
  pack: {
    title: string;
    targetRelationship: string;
    sensitivity: string;
    cards: readonly unknown[];
  } = oldFriendManifest,
): OldFriendSummary {
  const presentation = getPackPresentation("old-friend");
  return {
    title: pack.title,
    relationship: relationshipLabel(pack.targetRelationship),
    sensitivity: sensitivityLabel(pack.sensitivity),
    questionCount: pack.cards.length,
    mood: presentation.moodLabel,
    estimatedMinutes: presentation.estimatedMinutes,
    sharing:
      presentation.defaultShareKind === "public"
        ? "공개 공유 추천"
        : "1:1 공유 추천",
    coverRecipe: presentation.cover.recipe,
    coverStyle: presentation.cover.style,
  };
}

export default async function Home() {
  noStore();
  const prototypeEnabled = process.env.NODE_ENV === "development";
  let published = null;
  if (!prototypeEnabled) {
    try {
      published = await readPublishedPack("old-friend");
    } catch {
      published = null;
    }
  }

  return (
    <HomeClient
      prototypeEnabled={prototypeEnabled}
      oldFriendActive={published !== null}
      oldFriend={oldFriendSummary(published ?? oldFriendManifest)}
    />
  );
}
