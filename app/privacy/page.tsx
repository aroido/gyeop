import type { Metadata } from "next";
import Link from "next/link";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "개인정보와 문의 · 겹",
};

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <article className={styles.card}>
        <p className={styles.brand}>겹 · 이용 안내</p>
        <h1>개인정보와 문의</h1>
        <p>
          겹은 연령이나 국가 확인 없이 참여할 수 있는 질문팩 서비스예요.
          생년월일, 신분증, 보호자 정보는 받지 않아요.
        </p>
        <h2>질문팩과 삭제</h2>
        <p>
          모든 질문팩은 전체 연령이 답할 수 있는 내용만 제공해요. 답변 삭제는
          관리 링크에서 직접 처리할 수 있어요. 안전 관련 공개 문의 채널은 공개
          모집 전에 안내할게요.
        </p>
        <h2>문의</h2>
        <p>
          문의 접수 채널을 준비 중이에요. 공개 모집 전 이 페이지에 안내할게요.
        </p>
        <Link href="/">홈으로</Link>
      </article>
    </main>
  );
}
