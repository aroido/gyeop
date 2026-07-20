"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  bootstrapOwnerPlay,
  clearOwnerSession,
  OwnerFlowHttpError,
} from "@/lib/owner-flow/owner-flow-client";

import styles from "../[playId]/page.module.css";

type State = "loading" | "retryable" | "terminal";

function isRetryable(error: unknown) {
  return (
    !(error instanceof OwnerFlowHttpError) ||
    error.status === 429 ||
    error.status >= 500
  );
}

export default function BootstrapOwnerPlay({
  pack,
  packTitle,
  entrySource,
}: {
  pack: string | null;
  packTitle: string | null;
  entrySource: "home" | "same_pack_cta";
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>(pack ? "loading" : "terminal");
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    if (!pack || state !== "loading") return;
    let active = true;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 620));
    void Promise.all([bootstrapOwnerPlay(pack, entrySource), delay])
      .then((play) => {
        if (active) router.replace(`/play/${encodeURIComponent(play[0].id)}`);
      })
      .catch((error: unknown) => {
        if (active) setState(isRetryable(error) ? "retryable" : "terminal");
      });
    return () => {
      active = false;
    };
  }, [attempt, entrySource, pack, router, state]);

  useEffect(() => {
    if (state !== "loading") {
      headingRef.current?.focus();
    }
  }, [state]);

  async function startNew() {
    if (clearing) return;
    setClearing(true);
    try {
      await clearOwnerSession();
      setClearing(false);
      setState("loading");
    } catch {
      setClearing(false);
      setState("terminal");
    }
  }

  if (state === "loading") {
    return (
      <main className={styles.shell} data-pack={pack ?? undefined}>
        <section className={styles.packOpening} aria-labelledby="opening-title">
          <div className={styles.openingCards} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <p className={styles.brand}>겹 · PACK OPEN</p>
          <h1 id="opening-title">{packTitle}</h1>
          <p className={styles.loading} role="status">
            첫 장을 꺼내는 중…
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell} data-pack={pack ?? undefined}>
      <section className={styles.message} aria-labelledby="start-error-title">
        <p className={styles.brand}>겹{packTitle ? ` · ${packTitle}` : ""}</p>
        <h1 id="start-error-title" ref={headingRef} tabIndex={-1}>
          팩을 시작하지 못했어요
        </h1>
        <p>잠시 뒤 다시 시도하거나 이 브라우저에서 새 팩을 시작해 주세요.</p>
        <div className={styles.messageActions}>
          {state === "retryable" && pack ? (
            <button
              type="button"
              onClick={() => {
                setState("loading");
                setAttempt((value) => value + 1);
              }}
            >
              다시 시도
            </button>
          ) : null}
          {pack ? (
            <button type="button" onClick={startNew} disabled={clearing}>
              {clearing ? "새 팩을 준비하는 중…" : "새 팩 시작"}
            </button>
          ) : (
            <button type="button" onClick={() => router.push("/")}>
              홈으로
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
