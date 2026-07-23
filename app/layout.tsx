import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const title = "겹 · 나를 보는 시선이 쌓이는 프로필";
const description = "내가 답하고 친구의 시선을 겹쳐 보는 모바일 소셜 프로필";

function metadataBase() {
  try {
    return new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
  } catch {
    return new URL("http://127.0.0.1:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title,
  description,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title,
    description,
    images: [
      {
        url: "/og/gyeop-share.png",
        width: 1200,
        height: 630,
        alt: "겹 질문팩 초대",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og/gyeop-share.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
