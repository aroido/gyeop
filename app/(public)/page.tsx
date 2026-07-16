import styles from "./page.module.css";

const packFacts = [
  ["추천 관계", "오래된 친구"],
  ["분량", "A/B 10장 · 약 2분"],
  ["분위기", "따뜻한 회상"],
  ["공유", "낮은 민감도 · 공개 추천"],
] as const;

export default function Home() {
  const prototypeEnabled = process.env.NODE_ENV === "development";

  return (
    <main className={styles.shell}>
      <header className={styles.intro} data-testid="home-intro">
        <div className={styles.brandRow}>
          <span className={styles.brandMark} aria-hidden="true">
            겹
          </span>
          <p className={styles.brandCopy}>친구의 시선을 겹쳐보는 질문팩</p>
        </div>

        <h1>
          오래 본 친구는
          <br />
          <strong>나를 어떻게 기억할까?</strong>
        </h1>
        <p className={styles.promise}>
          내가 먼저 답하면 친구는 3장만 골라요. 같은 질문에서 서로의 시선이
          어디서 겹치는지 확인해보세요.
        </p>
      </header>

      <section
        className={styles.pack}
        aria-labelledby="pack-title"
        data-testid="pack-card"
      >
        <div className={styles.layerBack} aria-hidden="true" />
        <div className={styles.layerMiddle} aria-hidden="true" />

        <div className={styles.card}>
          <div className={styles.packHeading}>
            <p className={styles.eyebrow}>첫 번째 공식 질문팩</p>
            <h2 id="pack-title">오래된 친구팩</h2>
          </div>

          <div className={styles.preview} aria-label="비교 결과 미리보기">
            <p>서운한 일이 생기면 나는?</p>
            <div className={styles.previewAnswers} aria-hidden="true">
              <span>내가 보는 나</span>
              <span>친구가 보는 나</span>
            </div>
          </div>

          <dl className={styles.facts} aria-label="팩 정보">
            {packFacts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {prototypeEnabled ? (
            <a className={styles.cta} href="/play/old-friend">
              팩 열어보기
            </a>
          ) : (
            <button className={styles.cta} type="button" disabled>
              팩 준비 중
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
