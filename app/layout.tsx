import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "겹 · 나를 보는 시선이 쌓이는 프로필",
  description: "내가 답하고 친구의 시선을 겹쳐 보는 모바일 소셜 프로필",
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
