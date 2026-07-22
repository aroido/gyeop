import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";

import {
  loadInvitePreview,
  type InvitePreview,
} from "@/lib/share-links/invite-preview";
import { inviteOgFallbackResponse } from "@/lib/share-links/invite-og-fallback.mjs";
import { isSharePublicId } from "@/lib/share-links/share-link-state-core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "겹 질문팩 초대";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TONES: Readonly<Record<string, readonly [string, string]>> = {
  lime: ["#dfff00", "#315cff"],
  blue: ["#315cff", "#dfff00"],
  coral: ["#ff6f61", "#dfff00"],
  purple: ["#935cff", "#dfff00"],
  pink: ["#ff70ad", "#315cff"],
  orange: ["#ff9f1c", "#315cff"],
};

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function inviteImage(
  preview: InvitePreview,
  accent: string,
  secondary: string,
) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "#050505",
        color: "#ffffff",
        fontFamily: "Noto Sans KR",
        borderTop: `24px solid ${accent}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 34, fontWeight: 900 }}>겹 · 질문팩 초대</span>
        <span
          style={{
            display: "flex",
            padding: "12px 22px",
            borderRadius: 999,
            background: secondary,
            color: "#050505",
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          3개만 고르기
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {preview.packTitle ? (
          <span style={{ color: accent, fontSize: 30, fontWeight: 900 }}>
            {preview.packTitle}
          </span>
        ) : null}
        <span
          style={{
            marginTop: 16,
            maxWidth: 1000,
            fontSize: 76,
            fontWeight: 900,
            lineHeight: 1.12,
            letterSpacing: "-0.05em",
          }}
        >
          {preview.nickname}님을 보는 내 시선은?
        </span>
        <span style={{ marginTop: 24, color: "#c7c7c7", fontSize: 28 }}>
          실제 답과 바로 비교할 수 있어요
        </span>
      </div>
    </div>
  );
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  try {
    const { publicId } = await params;
    if (!isSharePublicId(publicId)) return inviteOgFallbackResponse();
    const preview = await loadInvitePreview(publicId);
    if (!preview) return inviteOgFallbackResponse();

    const font = await readFile(
      new URL("./assets/NotoSansKR-InviteSubset.ttf", import.meta.url),
    );
    const [accent, secondary] = TONES[preview.coverTone] ?? TONES.lime;
    const rendered = new ImageResponse(
      inviteImage(preview, accent, secondary),
      {
        ...size,
        fonts: [
          {
            name: "Noto Sans KR",
            data: new Uint8Array(font).buffer,
            weight: 900,
            style: "normal",
          },
        ],
      },
    );
    const png = await rendered.arrayBuffer();
    return noStore(
      new Response(png, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
  } catch (error) {
    console.error("Failed to render invite Open Graph image", error);
    return inviteOgFallbackResponse();
  }
}
