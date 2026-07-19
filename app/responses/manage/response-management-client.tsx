"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  parseManagementFragment,
  removeManagementRecordMatchingSecret,
} from "@/lib/visitor-management/management-secret";
import {
  VisitorWithdrawalHttpError,
  withdrawVisitorResponse,
} from "@/lib/visitor-management/visitor-withdrawal-client";

import styles from "./response-management.module.css";

type View =
  | "loading"
  | "confirm"
  | "submitting"
  | "success"
  | "unavailable"
  | "rate_limited"
  | "retry";

export default function ManageResponseClient() {
  const [view, setView] = useState<View>("loading");
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(
    null,
  );
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    function consumeFragment() {
      const fragment = window.location.hash;
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      try {
        tokenRef.current = parseManagementFragment(fragment);
        setRetryAfterSeconds(null);
        setView("confirm");
      } catch {
        tokenRef.current = null;
        setView("unavailable");
      }
    }

    window.addEventListener("hashchange", consumeFragment);
    consumeFragment();
    return () => window.removeEventListener("hashchange", consumeFragment);
  }, []);

  async function withdraw() {
    const token = tokenRef.current;
    if (!token) {
      setView("unavailable");
      return;
    }
    setView("submitting");
    try {
      await withdrawVisitorResponse(token);
      try {
        removeManagementRecordMatchingSecret(token);
      } catch {
        // The server-side withdrawal is already committed.
      }
      tokenRef.current = null;
      setView("success");
    } catch (error) {
      if (
        error instanceof VisitorWithdrawalHttpError &&
        error.status === 404 &&
        error.code === "RESPONSE_MANAGEMENT_UNAVAILABLE"
      ) {
        try {
          removeManagementRecordMatchingSecret(token);
        } catch {
          // A malformed local record is never deleted by capability alone.
        }
        tokenRef.current = null;
        setView("unavailable");
        return;
      }
      if (
        error instanceof VisitorWithdrawalHttpError &&
        error.status === 429 &&
        error.retryAfterSeconds !== null
      ) {
        setRetryAfterSeconds(error.retryAfterSeconds);
        setView("rate_limited");
        return;
      }
      setView("retry");
    }
  }

  const terminal = view === "success" || view === "unavailable";

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-busy={view === "submitting"}>
        <p className={styles.brand}>겹 · PRIVATE RESPONSE</p>

        {view === "loading" ? (
          <div className={styles.state} role="status" aria-live="polite">
            <h1>관리 링크를 확인하고 있어요</h1>
          </div>
        ) : null}

        {view === "confirm" || view === "submitting" ? (
          <>
            <span className={styles.kicker}>영구 철회</span>
            <h1>이 답변을 지울까요?</h1>
            <p className={styles.lead}>
              아래 내용은 실제로 제거되며 다시 되돌릴 수 없어요.
            </p>
            <ul className={styles.removalList}>
              <li>내가 고른 A/B 답</li>
              <li>관계와 알게 된 시점</li>
              <li>친구 프로필과 집계에 더해진 내 시선</li>
            </ul>
            <p className={styles.warning}>삭제 후에는 복구할 수 없습니다.</p>
            <Link className={styles.keep} href="/">
              답변 남겨두기
            </Link>
            <button
              className={styles.withdraw}
              type="button"
              disabled={view === "submitting"}
              onClick={() => void withdraw()}
            >
              {view === "submitting" ? "철회하는 중…" : "이 답변 철회하기"}
            </button>
          </>
        ) : null}

        {view === "success" ? (
          <div className={styles.state} role="status" aria-live="polite">
            <span className={styles.kicker}>완료</span>
            <h1>답변을 철회했어요</h1>
            <p>답과 관계 정보, 프로필에 더해졌던 시선을 제거했습니다.</p>
            <Link className={styles.keep} href="/">
              겹으로 돌아가기
            </Link>
          </div>
        ) : null}

        {view === "unavailable" ? (
          <div className={styles.state} role="alert">
            <span className={styles.kicker}>사용 불가</span>
            <h1>이 관리 링크는 사용할 수 없어요</h1>
            <p>잘못된 링크이거나 이미 답변을 철회했을 수 있어요.</p>
            <Link className={styles.keep} href="/">
              겹으로 돌아가기
            </Link>
          </div>
        ) : null}

        {view === "rate_limited" ? (
          <div className={styles.state} role="alert" aria-live="assertive">
            <span className={styles.kicker}>잠시 대기</span>
            <h1>잠시 후 다시 시도해 주세요</h1>
            <p>
              약 {retryAfterSeconds ?? 1}초 뒤 이 화면에서 다시 시도할 수
              있어요.
            </p>
            <button
              className={styles.keep}
              type="button"
              onClick={() => void withdraw()}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {view === "retry" ? (
          <div className={styles.state} role="alert" aria-live="assertive">
            <span className={styles.kicker}>연결 오류</span>
            <h1>답변을 철회하지 못했어요</h1>
            <p>
              답변은 그대로 남아 있습니다. 연결을 확인해 다시 시도해 주세요.
            </p>
            <button
              className={styles.keep}
              type="button"
              onClick={() => void withdraw()}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        <p className={styles.live} aria-live="polite">
          {view === "submitting" ? "답변을 철회하는 중입니다." : ""}
          {terminal && view === "success" ? "답변 철회가 완료되었습니다." : ""}
        </p>
      </section>
    </main>
  );
}
