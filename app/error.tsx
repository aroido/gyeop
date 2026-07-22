"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import styles from "./recovery.module.css";

export default function ErrorScreen({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.brand}>겹</p>
        <h1 ref={headingRef} tabIndex={-1}>
          화면을 불러오지 못했어요
        </h1>
        <p>잠시 뒤 다시 시도하거나 질문팩을 고르는 화면으로 돌아가 주세요.</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={reset}>
            다시 시도
          </button>
          <Link className={styles.secondary} href="/">
            홈으로
          </Link>
        </div>
      </section>
    </main>
  );
}
