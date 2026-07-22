import type { Metadata } from "next";

import { validateAppUrl } from "@/lib/http/http-boundary-core.mjs";
import { loadInvitePreview } from "@/lib/share-links/invite-preview";
import { isSharePublicId } from "@/lib/share-links/share-link-state-core.mjs";

import InviteEntry from "./invite-entry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DESCRIPTION = "3개만 고르면 실제 답과 바로 비교할 수 있어요";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const valid = isSharePublicId(publicId);
  const preview = valid ? await loadInvitePreview(publicId) : null;
  const appUrl = validateAppUrl(process.env.APP_URL, process.env.NODE_ENV);
  const title = preview
    ? `${preview.nickname}님을 보는 내 시선은?`
    : "겹 · 친구가 먼저 답한 질문팩";
  const image = new URL(
    preview ? `/i/${publicId}/opengraph-image` : "/og/gyeop-share.png",
    appUrl,
  ).toString();
  const canonical = new URL(valid ? `/i/${publicId}` : "/", appUrl).toString();
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      title,
      description: DESCRIPTION,
      type: "website",
      url: canonical,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: DESCRIPTION,
      images: [image],
    },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const validPublicId = isSharePublicId(publicId) ? publicId : null;
  const preview = validPublicId ? await loadInvitePreview(validPublicId) : null;
  return (
    <InviteEntry
      publicId={validPublicId}
      preview={
        preview
          ? { nickname: preview.nickname, packTitle: preview.packTitle }
          : null
      }
    />
  );
}
