import Link from "next/link";

import styles from "./recovery.module.css";

export default function NotFound() {
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.brand}>겹 · 404</p>
        <h1 tabIndex={-1} autoFocus>
          이 페이지를 찾을 수 없어요
        </h1>
        <p>주소가 바뀌었거나 더 이상 열 수 없는 페이지예요.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/">
            질문팩 둘러보기
          </Link>
        </div>
      </section>
    </main>
  );
}
