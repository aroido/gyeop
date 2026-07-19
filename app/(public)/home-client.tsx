"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import styles from "./page.module.css";

export type PackSummary = Readonly<{
  slug: string;
  title: string;
  active: boolean;
  relationship: string;
  sensitivity: string;
  questionCount: number;
  mood: string;
  estimatedMinutes: number;
  sharing: string;
  coverRecipe: string;
  coverStyle: Readonly<CSSProperties>;
}>;

const cardClasses: Readonly<Record<string, string>> = Object.freeze({
  "old-friend": "activeCard",
  "first-impression": "blueCard",
  coworker: "redCard",
  "honest-self": "blackCard",
});

export default function HomeClient({
  packs,
}: {
  packs: readonly PackSummary[];
}) {
  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.brand} aria-label="겹">
          <span aria-hidden="true">✳</span>
          <strong>겹</strong>
          <small>GYEOP</small>
        </header>

        <section className={styles.hero} aria-labelledby="home-title">
          <p>나를 보는 여러 시선</p>
          <h1 id="home-title">
            친구가 보는 나는
            <br />
            내가 아는 나와
            <br />
            <mark>같을까?</mark>
          </h1>

          <div className={styles.perspectiveStack} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className={styles.packs} aria-labelledby="pack-title">
          <div className={styles.packHeading}>
            <h2 id="pack-title">질문팩</h2>
            <p>옆으로 넘겨보기 →</p>
          </div>

          <ul
            className={styles.packRail}
            aria-label="질문팩 미리보기"
            data-testid="pack-rail"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.currentTarget.scrollLeft +=
                  event.currentTarget.clientWidth;
              }
              if (event.key === "ArrowLeft") {
                event.currentTarget.scrollLeft -=
                  event.currentTarget.clientWidth;
              }
            }}
            tabIndex={0}
          >
            {packs.map((pack, index) => (
              <li key={pack.slug}>
                <article
                  className={`${styles.packCard} ${styles[cardClasses[pack.slug] ?? "activeCard"]}`}
                  data-pack-state={pack.active ? "active" : "upcoming"}
                  data-cover-variant={pack.coverRecipe}
                  style={pack.coverStyle}
                >
                  <div className={styles.cardTopline}>
                    <span>{pack.active ? "지금 시작" : "준비 중"}</span>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </div>
                  <h3>{pack.title}</h3>
                  <p className={styles.relationship}>{pack.relationship}</p>
                  <div className={styles.packMeta}>
                    <span>질문 {pack.questionCount}장</span>
                    <span>약 {pack.estimatedMinutes}분</span>
                    <span>{pack.mood}</span>
                    <span>{pack.sensitivity}</span>
                    <span>{pack.sharing}</span>
                  </div>

                  {pack.active ? (
                    <Link
                      className={styles.cta}
                      href={`/play/new?pack=${encodeURIComponent(pack.slug)}`}
                    >
                      질문 시작하기 <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <button className={styles.cta} type="button" disabled>
                      준비 중
                    </button>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
