import { unstable_noStore as noStore } from "next/cache";

import { readPublishedPack } from "@/lib/http/published-pack";
import { relationshipLabel, sensitivityLabel } from "@/lib/packs/labels";
import { packManifests } from "@/lib/packs/catalog";

import HomeClient, { type PackSummary } from "./home-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function packSummary(
  pack: {
    slug: string;
    title: string;
    targetRelationship: string;
    sensitivity: string;
    cards: readonly unknown[];
  },
  manifest: (typeof packManifests)[number],
  active: boolean,
): PackSummary {
  return {
    slug: pack.slug,
    title: pack.title,
    active,
    relationship: relationshipLabel(pack.targetRelationship),
    sensitivity: sensitivityLabel(pack.sensitivity),
    questionCount: pack.cards.length,
    mood: manifest.presentation.moodLabel,
    estimatedMinutes: manifest.presentation.estimatedMinutes,
    sharing:
      manifest.presentation.defaultShareKind === "public"
        ? "공개 공유 추천"
        : "1:1 공유 추천",
    coverRecipe: manifest.presentation.coverRecipe,
    coverTone: manifest.presentation.coverTone,
  };
}

export default async function Home() {
  noStore();
  const development = process.env.NODE_ENV === "development";
  const published = development
    ? packManifests.map((manifest) => (manifest.active ? manifest : null))
    : await Promise.all(
        packManifests.map((manifest) =>
          readPublishedPack(manifest.slug).catch(() => null),
        ),
      );

  return (
    <HomeClient
      packs={packManifests.map((manifest, index) =>
        packSummary(
          published[index] ?? manifest,
          manifest,
          published[index] !== null,
        ),
      )}
    />
  );
}
