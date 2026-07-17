"use client";

import styles from "./page.module.css";

const upcomingPacks = [
  { title: "첫인상팩", style: styles.blueCard, number: "02" },
  { title: "직장동료팩", style: styles.redCard, number: "03" },
  { title: "솔직한 나팩", style: styles.blackCard, number: "04" },
];

export default function Home() {
  const prototypeEnabled = process.env.NODE_ENV === "development";

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
            <li>
              <article
                className={`${styles.packCard} ${styles.activeCard}`}
                data-pack-state="active"
              >
                <div className={styles.cardTopline}>
                  <span>지금 시작</span>
                  <b>01</b>
                </div>
                <h3>오래된 친구팩</h3>
                <p className={styles.relationship}>오래된 친구</p>
                <div className={styles.packMeta}>
                  <span>질문 10장</span>
                  <span>약 2분</span>
                  <span>따뜻한 회상</span>
                  <span>낮은 민감도</span>
                  <span>공개 공유 추천</span>
                </div>

                {prototypeEnabled ? (
                  <a className={styles.cta} href="/play/old-friend">
                    팩 열어보기 <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <button className={styles.cta} type="button" disabled>
                    팩 준비 중
                  </button>
                )}
              </article>
            </li>

            {upcomingPacks.map((pack) => (
              <li key={pack.title}>
                <article
                  className={`${styles.packCard} ${pack.style}`}
                  data-pack-state="upcoming"
                >
                  <div className={styles.cardTopline}>
                    <span>준비 중</span>
                    <b>{pack.number}</b>
                  </div>
                  <h3>{pack.title}</h3>
                  <span className={styles.cardMark} aria-hidden="true">
                    ✳
                  </span>
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
