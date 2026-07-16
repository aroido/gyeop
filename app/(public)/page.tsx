import styles from "./page.module.css";

export default function Home() {
  const prototypeEnabled = process.env.NODE_ENV === "development";

  return (
    <main className={styles.shell}>
      <header className={styles.brand} aria-label="겹">
        <span aria-hidden="true" />
        <strong>겹</strong>
      </header>

      <div className={styles.hero} aria-hidden="true" data-testid="home-hero">
        <article className={`${styles.card} ${styles.selfCard}`}>
          <span className={styles.avatar}>나</span>
          <p>내가 보는 나</p>
          <i />
          <i />
        </article>

        <article className={`${styles.card} ${styles.friendCard}`}>
          <span className={styles.avatar}>친</span>
          <p>친구가 보는 나</p>
          <i />
          <i />
        </article>

        <span className={styles.overlap}>겹</span>
      </div>

      <section className={styles.copy} aria-labelledby="home-title">
        <h1 id="home-title">
          친구가 보는 나는
          <br />
          내가 아는 나와 같을까?
        </h1>
        <p>10개 질문 · 약 2분</p>
      </section>

      {prototypeEnabled ? (
        <a className={styles.cta} href="/play/old-friend">
          팩 열어보기
        </a>
      ) : (
        <button className={styles.cta} type="button" disabled>
          팩 준비 중
        </button>
      )}
    </main>
  );
}
