import styles from "./owner-list.module.css";

export default function OwnerProfileLoading() {
  return (
    <main className={styles.shell}>
      <section className={styles.loading} aria-live="polite" aria-busy="true">
        <p className={styles.brand}>겹 · 내 프로필</p>
        <h1>내 겹을 불러오는 중…</h1>
        <div aria-hidden="true" />
      </section>
    </main>
  );
}
