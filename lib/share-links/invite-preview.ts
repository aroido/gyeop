import "server-only";

import { getInvitePreview } from "../db/internal-rpc.ts";
import { findPackManifestVersion } from "../packs/catalog.ts";

export type InvitePreview = Readonly<{
  nickname: string;
  kind: "public" | "one_to_one";
  packTitle: string | null;
  coverRecipe: string | null;
  coverTone: string;
}>;

export async function loadInvitePreview(
  publicId: string,
): Promise<InvitePreview | null> {
  try {
    const result = await getInvitePreview({ publicId });
    if (result.outcome !== "available") return null;
    const manifest = findPackManifestVersion(
      result.packSlug,
      result.packVersion,
    );
    if (
      !manifest ||
      manifest.title !== result.packTitle ||
      manifest.sensitivity !== result.sensitivity
    ) {
      return null;
    }
    const rich = result.kind === "public" && result.sensitivity === "low";
    return Object.freeze({
      nickname: result.previewNickname,
      kind: result.kind,
      packTitle: rich ? manifest.title : null,
      coverRecipe: rich ? manifest.presentation.coverRecipe : null,
      coverTone: rich ? manifest.presentation.coverTone : "lime",
    });
  } catch {
    return null;
  }
}
