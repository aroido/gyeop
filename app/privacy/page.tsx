import type { Metadata } from "next";
import Link from "next/link";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "이용 연령과 개인정보 · 겹",
};

export default function PrivacyPage() {
  return (
    <main className={styles.shell}>
      <article className={styles.card}>
        <p className={styles.brand}>겹 · 이용 안내</p>
        <h1>만 19세 이상만 참여할 수 있어요</h1>
        <p>
          겹은 지금 대한민국에서 이용하는 성인만을 위한 비공개 테스트예요.
          생년월일, 신분증, 보호자 정보는 받지 않아요.
        </p>
        <h2>미성년자 데이터</h2>
        <p>
          만 19세 미만임을 알게 된 데이터는 서비스에서 72시간 안에 삭제하고,
          백업에서는 30일 안에 삭제해요.
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
