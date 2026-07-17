import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { readPublishedPack } from "@/lib/http/published-pack";
import { relationshipLabel, sensitivityLabel } from "@/lib/packs/labels";
import { getPackPresentation } from "@/lib/packs/presentation";

import { getPack, type Pack } from "../packs";
import PackPlay from "./play";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PackPlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  noStore();
  const slug = (await params).slug;
  let pack: Pack | undefined;

  if (process.env.NODE_ENV === "development") {
    pack = getPack(slug);
  } else {
    try {
      const published = await readPublishedPack(slug);
      if (published) {
        const presentation = getPackPresentation(published.slug);
        pack = {
          slug: published.slug,
          title: published.title,
          storageKey: `gyeop:${published.slug}-play:v1`,
          relationship: relationshipLabel(published.targetRelationship),
          mood: presentation.moodLabel,
          sensitivity: sensitivityLabel(published.sensitivity),
          shareRecommendation:
            presentation.defaultShareKind === "public"
              ? "공개 공유 추천"
              : "1:1 공유 추천",
          cards: published.cards.map((card) => ({
            id: card.id,
            signature: card.isSignature || undefined,
            question: card.ownerPrompt,
            visitorQuestion: card.visitorPrompt,
            a: card.optionA,
            b: card.optionB,
          })),
        };
      }
    } catch {
      pack = undefined;
    }
  }

  if (!pack) notFound();

  return <PackPlay key={pack.slug} pack={pack} />;
}
