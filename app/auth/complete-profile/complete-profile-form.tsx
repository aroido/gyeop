"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import styles from "./complete-profile.module.css";

export default function CompleteProfileForm({
  returnTo,
}: {
  returnTo: string;
}) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/me/account-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        setError(
          typeof body?.message === "string"
            ? body.message
            : "닉네임을 저장하지 못했어요. 다시 시도해 주세요.",
        );
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError("닉네임을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="owner-nickname">친구에게 보일 닉네임</label>
      <input
        id="owner-nickname"
        name="nickname"
        autoComplete="nickname"
        autoFocus
        minLength={2}
        maxLength={12}
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        aria-describedby="nickname-help nickname-error"
      />
      <p id="nickname-help" className={styles.help}>
        한글, 영문, 숫자 2~12자 · 단어 사이는 한 칸만 쓸 수 있어요.
      </p>
      {error ? (
        <p id="nickname-error" className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={submitting}>
        {submitting ? "저장하는 중…" : "닉네임 저장"}
      </button>
    </form>
  );
}
