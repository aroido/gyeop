import type { Metadata } from "next";

import ManageResponseClient from "./response-management-client";

export const metadata: Metadata = {
  title: "답변 관리 · 겹",
  description: "비밀 관리 링크로 내가 남긴 답변을 관리합니다.",
  robots: { index: false, follow: false },
};

export default function ManageResponsePage() {
  return <ManageResponseClient />;
}
