"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import styles from "./sign-in.module.css";

type State = "idle" | "sending" | "sent" | "failed";

export default function SignInForm({
  playId,
  returnTo,
  callbackFailed,
  localEmailPreview,
}: {
  playId: string | null;
  returnTo: string;
  callbackFailed: boolean;
  localEmailPreview: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const emailRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const email = emailRef.current?.value.trim();
    if (!email) return;
    setState("sending");
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, playId, returnTo }),
      });
      setState(response.status === 202 ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="sign-in-title">
        <p className={styles.brand}>겹 · 질문팩 저장</p>
        <h1 ref={titleRef} id="sign-in-title" tabIndex={-1}>
          {playId ? "내 질문팩을 계정에 저장해요" : "내 질문팩 불러오기"}
        </h1>
        <p className={styles.lead}>
          이메일로 받은 한 번짜리 링크를 열면 끝나요. 이메일은 친구에게 보이지
          않아요.
        </p>

        {callbackFailed ? (
          <p className={styles.alert} role="alert">
            로그인 링크가 만료됐거나 다른 브라우저에서 열렸어요. 이 화면에서 새
            링크를 받아 주세요.
          </p>
        ) : null}

        {state === "sent" ? (
          <div className={styles.sent} role="status">
            <strong>로그인 링크를 보냈어요</strong>
            <p>이 브라우저에서 이메일의 링크를 열어 주세요.</p>
            {localEmailPreview ? (
              <a href="http://127.0.0.1:54324" target="_blank" rel="noreferrer">
                로컬 메일함 열기
              </a>
            ) : null}
            <button type="button" onClick={() => setState("idle")}>
              다시 보내기
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <label htmlFor="owner-email">이메일</label>
            <input
              ref={emailRef}
              id="owner-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              required
              disabled={state === "sending"}
              placeholder="name@example.com"
            />
            <button type="submit" disabled={state === "sending"}>
              {state === "sending" ? "보내는 중…" : "로그인 링크 보내기"}
            </button>
          </form>
        )}

        {state === "failed" ? (
          <p className={styles.alert} role="alert">
            링크를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.
          </p>
        ) : null}
        <Link className={styles.back} href={playId ? `/play/${playId}` : "/"}>
          {playId ? "내 질문으로 돌아가기" : "홈으로"}
        </Link>
      </section>
    </main>
  );
}
