"use client";

import { useState } from "react";

import styles from "./owner-list.module.css";

export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (response.status !== 204) throw new Error("logout failed");
      window.location.replace("/");
    } catch {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <div className={styles.logout}>
      <button type="button" disabled={pending} onClick={logout}>
        {pending ? "로그아웃 중…" : "로그아웃"}
      </button>
      {failed ? (
        <p role="alert">로그아웃하지 못했어요. 다시 시도해 주세요.</p>
      ) : null}
    </div>
  );
}
