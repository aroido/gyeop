import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.shell}>
      <header className={styles.intro}>
        <p className={styles.brand}>겹</p>
        <p className={styles.tagline}>
          내가 보는 나 위에, 친구가 보는 내가 한 겹씩.
        </p>
      </header>

      <section className={styles.pack} aria-labelledby="pack-title">
        <div className={styles.layerBack} aria-hidden="true" />
        <div className={styles.layerMiddle} aria-hidden="true" />

        <div className={styles.card}>
          <p className={styles.eyebrow}>첫 번째 공식 질문팩</p>
          <h1 id="pack-title">오래된 친구팩</h1>
          <p className={styles.description}>
            내가 먼저 답하고 링크를 보내면, 친구의 선택이 내 프로필에 겹쳐져요.
          </p>

          <ul className={styles.meta} aria-label="팩 정보">
            <li>질문 10장</li>
            <li>A/B 선택</li>
          </ul>

          <a className={styles.cta} href="#start-status">
            팩 열어보기
          </a>
          <p className={styles.status} id="start-status" tabIndex={-1}>
            답변 흐름을 준비 중이에요.
          </p>
        </div>
      </section>
    </main>
  );
}
