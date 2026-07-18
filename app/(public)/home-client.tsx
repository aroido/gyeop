"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import styles from "./page.module.css";

export type OldFriendSummary = Readonly<{
  title: string;
  relationship: string;
  sensitivity: string;
  questionCount: number;
  mood: string;
  estimatedMinutes: number;
  sharing: string;
  coverRecipe: string;
  coverStyle: Readonly<CSSProperties>;
}>;

const otherPackPreviews = [
  {
    slug: "first-impression",
    title: "첫인상팩",
    style: "blueCard",
    number: "02",
    relationship: "새로 알게 된 사이",
    mood: "가벼운 첫 만남",
    sensitivity: "낮은 민감도",
    sharing: "공개 공유 추천",
  },
  {
    slug: "coworker",
    title: "직장동료팩",
    style: "redCard",
    number: "03",
    relationship: "직장 동료",
    mood: "담백한 관찰",
    sensitivity: "낮은 민감도",
    sharing: "공개 공유 추천",
  },
  {
    slug: "honest-self",
    title: "솔직한 나팩",
    style: "blackCard",
    number: "04",
    relationship: "가까운 사이",
    mood: "차분한 솔직함",
    sensitivity: "중간 민감도",
    sharing: "1:1 공유 추천",
  },
] as const;

export default function HomeClient({
  oldFriendActive,
  oldFriend,
}: {
  oldFriendActive: boolean;
  oldFriend: OldFriendSummary;
}) {
  const packPreviews = [
    {
      slug: "old-friend",
      title: oldFriend.title,
      style: "activeCard",
      number: "01",
      relationship: oldFriend.relationship,
      mood: oldFriend.mood,
      sensitivity: oldFriend.sensitivity,
      sharing: oldFriend.sharing,
      questionCount: oldFriend.questionCount,
      estimatedMinutes: oldFriend.estimatedMinutes,
      coverRecipe: oldFriend.coverRecipe,
      coverStyle: oldFriend.coverStyle,
    },
    ...otherPackPreviews.map((pack) => ({
      ...pack,
      questionCount: 10,
      estimatedMinutes: 2,
      coverRecipe: undefined,
      coverStyle: undefined,
    })),
  ];

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
            {packPreviews.map((pack, index) => {
              const active = index === 0 && oldFriendActive;
              const showDetails = index === 0;

              return (
                <li key={pack.slug}>
                  <article
                    className={`${styles.packCard} ${styles[pack.style]}`}
                    data-pack-state={active ? "active" : "upcoming"}
                    data-cover-variant={pack.coverRecipe}
                    style={pack.coverStyle}
                  >
                    <div className={styles.cardTopline}>
                      <span>{active ? "지금 시작" : "준비 중"}</span>
                      <b>{pack.number}</b>
                    </div>
                    <h3>{pack.title}</h3>

                    {showDetails ? (
                      <>
                        <p className={styles.relationship}>
                          {pack.relationship}
                        </p>
                        <div className={styles.packMeta}>
                          <span>질문 {pack.questionCount}장</span>
                          <span>약 {pack.estimatedMinutes}분</span>
                          <span>{pack.mood}</span>
                          <span>{pack.sensitivity}</span>
                          <span>{pack.sharing}</span>
                        </div>
                      </>
                    ) : (
                      <span className={styles.cardMark} aria-hidden="true">
                        ✳
                      </span>
                    )}

                    {active ? (
                      <Link
                        className={styles.cta}
                        href="/play/new?pack=old-friend"
                      >
                        팩 열어보기 <span aria-hidden="true">→</span>
                      </Link>
                    ) : index === 0 ? (
                      <button className={styles.cta} type="button" disabled>
                        팩 준비 중
                      </button>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
