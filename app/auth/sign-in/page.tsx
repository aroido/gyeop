import Link from "next/link";

import { parseOwnerSignInTarget } from "@/lib/auth/owner-claim-context-core.mjs";

import SignInHeading from "./sign-in-heading";
import styles from "./sign-in.module.css";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string | string[];
    playId?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const query = await searchParams;
  let target = { playId: null as string | null, returnTo: "/me" };
  try {
    target = parseOwnerSignInTarget({
      playId: typeof query.playId === "string" ? query.playId : null,
      returnTo: typeof query.returnTo === "string" ? query.returnTo : "/me",
    });
  } catch {
    // Invalid external return targets fall back to the private owner page.
  }
  const googleParams = new URLSearchParams({ returnTo: target.returnTo });
  if (target.playId) googleParams.set("playId", target.playId);
  const error =
    query.error === "claim"
      ? "claim"
      : query.error === "callback"
        ? "callback"
        : null;

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <p className={styles.brand}>겹 · 질문팩 저장</p>
        <SignInHeading>
          {target.playId ? "내 질문팩을 계정에 저장해요" : "내 질문팩 불러오기"}
        </SignInHeading>
        <p className={styles.lead}>
          Google 계정으로 저장하면 다른 브라우저에서도 다시 열 수 있어요. 계정
          정보는 친구에게 보이지 않아요.
        </p>

        {error ? (
          <p className={styles.alert} role="alert">
            {error === "claim"
              ? "질문을 시작한 브라우저인지 확인하고 Google 로그인을 다시 시도해 주세요."
              : "Google 로그인을 완료하지 못했어요. 다시 시도해 주세요."}
          </p>
        ) : null}

        <Link
          className={styles.providerLink}
          href={`/auth/google?${googleParams.toString()}`}
        >
          Google로 계속하기
        </Link>
        <Link
          className={styles.back}
          href={target.playId ? `/play/${target.playId}` : "/"}
        >
          {target.playId ? "내 질문으로 돌아가기" : "홈으로"}
        </Link>
        {target.playId ? (
          <Link className={styles.back} href="/">
            다른 질문팩 보기
          </Link>
        ) : null}
      </section>
    </main>
  );
}
