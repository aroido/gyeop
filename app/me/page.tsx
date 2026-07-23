import Link from "next/link";
import { redirect } from "next/navigation";

import { loadAuthenticatedOwnerAccountProfile } from "@/lib/http/auth-owner";
import { loadOwnerPublicProfileGate } from "@/lib/http/owner-public-profile";

import AccountProfileView from "./account-profile-view";
import styles from "./owner-list.module.css";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  let gate = null;
  try {
    gate = await loadOwnerPublicProfileGate();
  } catch {
    return <LoadFailure />;
  }

  if (gate === null) {
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
  if (gate.outcome === "incomplete") {
    redirect("/auth/complete-profile?returnTo=%2Fme");
  }

  const profile = await loadAccountProfile(gate.nickname);
  return profile === null ? (
    <LoadFailure />
  ) : (
    <AccountProfileView profile={profile} />
  );
}

async function loadAccountProfile(nickname: string) {
  try {
    return await loadAuthenticatedOwnerAccountProfile(nickname);
  } catch {
    return null;
  }
}

function LoadFailure() {
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <p className={styles.brand}>겹 · 내 프로필</p>
        <h1 tabIndex={-1} autoFocus>
          프로필을 불러오지 못했어요
        </h1>
        <p>잠시 뒤 다시 시도해 주세요.</p>
        <Link className={styles.primary} href="/me">
          다시 시도
        </Link>
      </section>
    </main>
  );
}
