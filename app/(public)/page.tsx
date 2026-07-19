import { unstable_noStore as noStore } from "next/cache";

import coworkerManifest from "@/content/packs/coworker-v1.json";
import firstImpressionManifest from "@/content/packs/first-impression-v1.json";
import honestSelfManifest from "@/content/packs/honest-self-v1.json";
import oldFriendManifest from "@/content/packs/old-friend-v1.json";
import { readPublishedPack } from "@/lib/http/published-pack";
import { relationshipLabel, sensitivityLabel } from "@/lib/packs/labels";
import { getPackPresentation } from "@/lib/packs/presentation";

import HomeClient, { type PackSummary } from "./home-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const manifests = [
  oldFriendManifest,
  firstImpressionManifest,
  coworkerManifest,
  honestSelfManifest,
] as const;

function packSummary(
  pack: {
    slug: string;
    title: string;
    targetRelationship: string;
    sensitivity: string;
    cards: readonly unknown[];
  },
  active: boolean,
): PackSummary {
  const presentation = getPackPresentation(pack.slug);
  return {
    slug: pack.slug,
    title: pack.title,
    active,
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
  const development = process.env.NODE_ENV === "development";
  const published = development
    ? manifests.map((manifest) => (manifest.active ? manifest : null))
    : await Promise.all(
        manifests.map((manifest) =>
          readPublishedPack(manifest.slug).catch(() => null),
        ),
      );

  return (
    <HomeClient
      packs={manifests.map((manifest, index) =>
        packSummary(published[index] ?? manifest, published[index] !== null),
      )}
    />
  );
}
