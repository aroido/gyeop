import BootstrapOwnerPlay from "./bootstrap";
import { findPackManifest } from "@/lib/packs/catalog";

export default async function NewOwnerPlayPage({
  searchParams,
}: {
  searchParams: Promise<{
    pack?: string | string[];
    source?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const pack = query.pack;
  const manifest = typeof pack === "string" ? findPackManifest(pack) : null;
  const entrySource =
    query.source === "same_pack_cta" ? "same_pack_cta" : "home";
  return (
    <BootstrapOwnerPlay
      pack={manifest?.slug ?? null}
      packTitle={manifest?.title ?? null}
      packTone={manifest?.presentation.coverTone ?? null}
      packRecipe={manifest?.presentation.coverRecipe ?? null}
      entrySource={entrySource}
    />
  );
}
