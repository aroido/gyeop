import Link from "next/link";

import { loadAuthenticatedOwnerPlays } from "@/lib/http/auth-owner";

import LogoutButton from "./logout-button";
import styles from "./owner-list.module.css";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  let plays = null;
  try {
    plays = await loadAuthenticatedOwnerPlays();
  } catch {
    // The signed-out state below does not reveal whether an account exists.
  }

  if (plays === null) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.brand}>겹 · 내 질문팩</p>
          <h1 tabIndex={-1} autoFocus>
            로그인하면 저장한 팩을 다시 볼 수 있어요
          </h1>
          <p>Google 계정으로 다른 브라우저에서도 다시 열 수 있어요.</p>
          <Link className={styles.primary} href="/auth/sign-in?returnTo=%2Fme">
            Google로 로그인
          </Link>
          <Link className={styles.secondary} href="/">
            홈으로
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.list} aria-labelledby="owner-list-title">
        <p className={styles.brand}>겹 · 내 질문팩</p>
        <h1 id="owner-list-title" tabIndex={-1} autoFocus>
          저장한 질문팩
        </h1>
        <p className={styles.lead}>
          완료한 팩과 답변 중인 팩이 한곳에 모여 있어요.
        </p>
        {plays.length === 0 ? (
          <div className={styles.empty}>
            <p>아직 계정에 저장한 질문팩이 없어요.</p>
            <Link className={styles.primary} href="/">
              질문팩 시작하기
            </Link>
          </div>
        ) : (
          <ul className={styles.plays}>
            {plays.map((play) => (
              <li key={play.id}>
                <div>
                  <p>{play.status === "completed" ? "완료" : "답변 중"}</p>
                  <h2>{play.packTitle}</h2>
                  <span>{play.answeredCount}/10 저장</span>
                </div>
                {play.status === "completed" ? (
                  <Link href={`/me/plays/${play.id}`}>프로필·공유 관리</Link>
                ) : (
                  <Link href={`/play/${play.id}`}>이어서 답하기</Link>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link className={styles.secondary} href="/">
          다른 질문팩 고르기
        </Link>
        <LogoutButton />
      </section>
    </main>
  );
}
