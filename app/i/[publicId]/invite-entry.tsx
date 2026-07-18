"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { parseInviteFragment } from "@/lib/share-links/invite-fragment-core.mjs";
import {
  readInviteMetadata,
  ShareLinkHttpError,
  type InviteMetadata,
} from "@/lib/share-links/share-link-client";

import styles from "./invite.module.css";

type State =
  | { kind: "loading" }
  | { kind: "active"; metadata: InviteMetadata }
  | { kind: "unavailable" }
  | { kind: "retryable" };

export default function InviteEntry({ publicId }: { publicId: string | null }) {
  const [state, setState] = useState<State>(
    publicId ? { kind: "loading" } : { kind: "unavailable" },
  );
  const [attempt, setAttempt] = useState(0);
  const [fragmentVersion, setFragmentVersion] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const changed = () => setFragmentVersion((value) => value + 1);
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  useEffect(() => {
    if (!publicId) return;
    const fragment = parseInviteFragment(window.location.hash);
    if (fragment.outcome !== "valid") {
      queueMicrotask(() => setState({ kind: "unavailable" }));
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setState({ kind: "loading" });
    });
    void readInviteMetadata(publicId, fragment.secret)
      .then((metadata) => {
        if (active) setState({ kind: "active", metadata });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof ShareLinkHttpError && error.status === 404
            ? { kind: "unavailable" }
            : { kind: "retryable" },
        );
      });
    return () => {
      active = false;
    };
  }, [attempt, fragmentVersion, publicId]);

  useEffect(() => {
    if (state.kind !== "loading") headingRef.current?.focus();
  }, [state.kind]);

  if (state.kind === "loading") {
    return (
      <main className={styles.shell}>
        <p className={styles.loading} role="status">
          초대를 확인하는 중…
        </p>
      </main>
    );
  }
  if (state.kind === "unavailable") {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.brand}>겹</p>
          <h1 ref={headingRef} tabIndex={-1}>
            이 초대는 지금 참여할 수 없어요
          </h1>
          <p>링크가 만료됐거나 더 이상 열려 있지 않아요.</p>
          <Link href="/">겹 둘러보기</Link>
        </section>
      </main>
    );
  }
  if (state.kind === "retryable") {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <p className={styles.brand}>겹</p>
          <h1 ref={headingRef} tabIndex={-1}>
            초대를 확인하지 못했어요
          </h1>
          <p aria-live="polite">연결을 확인하고 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            다시 시도
          </button>
        </section>
      </main>
    );
  }
  return (
    <main className={styles.shell}>
      <section className={styles.card} data-kind={state.metadata.kind}>
        <p className={styles.brand}>겹 · {state.metadata.packTitle}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          친구가 먼저 답한 질문팩이에요
        </h1>
        <p>이 사람을 어떻게 보고 있는지 3장으로 답해보세요.</p>
        <span className={styles.kind}>
          {state.metadata.kind === "public"
            ? "여러 친구가 함께 참여"
            : "나에게 온 1:1 초대"}
        </span>
        <aside>친구 답변은 다음 단계에서 이어져요.</aside>
      </section>
    </main>
  );
}
