"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./eligibility-gate.module.css";

export default function EligibilityGate({
  onConfirm,
}: {
  onConfirm: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (blocked) headingRef.current?.focus();
  }, [blocked]);

  if (blocked) {
    return (
      <main className={styles.shell}>
        <section
          className={styles.card}
          aria-labelledby="eligibility-blocked-title"
        >
          <p className={styles.brand}>겹</p>
          <h1 id="eligibility-blocked-title" ref={headingRef} tabIndex={-1}>
            지금은 겹을 이용할 수 없어요
          </h1>
          <p>답변이나 프로필은 저장되지 않았어요.</p>
          <Link href="/">홈으로</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="eligibility-title">
        <p className={styles.brand}>겹</p>
        <h1 id="eligibility-title" ref={headingRef} tabIndex={-1}>
          겹은 만 19세 이상만 이용할 수 있어요
        </h1>
        <p>
          지금은 대한민국에서 이용하는 성인만 참여할 수 있어요. 생년월일이나
          신분증은 받지 않아요.
        </p>
        <label className={styles.confirmation}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>만 19세 이상이며 대한민국에서 이용 중이에요.</span>
        </label>
        <button type="button" disabled={!confirmed} onClick={onConfirm}>
          확인하고 계속
        </button>
        <button
          className={styles.secondary}
          type="button"
          onClick={() => setBlocked(true)}
        >
          아직 만 19세가 아니에요
        </button>
      </section>
    </main>
  );
}
