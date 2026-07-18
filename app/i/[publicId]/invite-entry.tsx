"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { parseInviteFragment } from "@/lib/share-links/invite-fragment-core.mjs";
import {
  readInviteMetadata,
  ShareLinkHttpError,
  type InviteMetadata,
} from "@/lib/share-links/share-link-client";
import {
  KNOWN_SINCE_OPTIONS,
  RELATIONSHIP_OPTIONS,
} from "@/lib/visitor-response/visitor-context-core.mjs";
import {
  resumeVisitorResponse,
  startVisitorResponse,
  VisitorResponseHttpError,
  type VisitorResponse,
} from "@/lib/visitor-response/visitor-response-client";

import styles from "./invite.module.css";

type State =
  | { kind: "loading" }
  | {
      kind: "active";
      metadata: InviteMetadata;
      secret: string;
      response: VisitorResponse | null;
    }
  | { kind: "unavailable" }
  | { kind: "retryable" };

export default function InviteEntry({ publicId }: { publicId: string | null }) {
  const [state, setState] = useState<State>(
    publicId ? { kind: "loading" } : { kind: "unavailable" },
  );
  const [attempt, setAttempt] = useState(0);
  const [fragmentVersion, setFragmentVersion] = useState(0);
  const [relationshipCode, setRelationshipCode] = useState("");
  const [knownSinceCode, setKnownSinceCode] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<"rate" | "retry" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitLatch = useRef(false);

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
      .then(async (metadata) => {
        if (metadata.kind === "one_to_one") return { metadata, response: null };
        const response = await resumeVisitorResponse(publicId, fragment.secret);
        return { metadata, response };
      })
      .then(({ metadata, response }) => {
        if (!active) return;
        if (response) {
          setRelationshipCode(response.relationshipCode);
          setKnownSinceCode(response.knownSinceCode);
        }
        setState({
          kind: "active",
          metadata,
          secret: fragment.secret,
          response,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const unavailable =
          (error instanceof ShareLinkHttpError && error.status === 404) ||
          (error instanceof VisitorResponseHttpError && error.status === 404);
        setState(unavailable ? { kind: "unavailable" } : { kind: "retryable" });
      });
    return () => {
      active = false;
    };
  }, [attempt, fragmentVersion, publicId]);

  const focusKey =
    state.kind === "active" && state.response ? "started" : state.kind;
  useEffect(() => {
    if (focusKey !== "loading") headingRef.current?.focus();
  }, [focusKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !publicId ||
      state.kind !== "active" ||
      state.metadata.kind !== "public" ||
      state.response ||
      !relationshipCode ||
      !knownSinceCode ||
      submitLatch.current
    ) {
      return;
    }
    submitLatch.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const response = await startVisitorResponse(
        publicId,
        state.secret,
        relationshipCode,
        knownSinceCode,
      );
      setState({ ...state, response });
    } catch (error: unknown) {
      if (error instanceof VisitorResponseHttpError && error.status === 404) {
        setState({ kind: "unavailable" });
      } else {
        setStartError(
          error instanceof VisitorResponseHttpError && error.status === 429
            ? "rate"
            : "retry",
        );
      }
    } finally {
      submitLatch.current = false;
      setStarting(false);
    }
  }

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
          <p role="alert">연결을 확인하고 다시 시도해 주세요.</p>
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

  if (state.metadata.kind === "one_to_one") {
    return (
      <main className={styles.shell}>
        <section className={styles.card} data-kind="one_to_one">
          <p className={styles.brand}>겹 · {state.metadata.packTitle}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            친구가 먼저 답한 질문팩이에요
          </h1>
          <p>이 사람을 어떻게 보고 있는지 3장으로 답해보세요.</p>
          <span className={styles.kind}>나에게 온 1:1 초대</span>
          <aside>1:1 응답은 다음 단계에서 이어져요.</aside>
        </section>
      </main>
    );
  }

  if (state.response) {
    return (
      <main className={styles.shell}>
        <section className={styles.card} data-kind="public" role="status">
          <p className={styles.brand}>겹 · {state.metadata.packTitle}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            응답을 시작했어요
          </h1>
          <p>
            고른 관계와 시점을 저장했어요. 3장 질문은 다음 단계에서 이어져요.
          </p>
          <dl className={styles.savedContext}>
            <div>
              <dt>우리 관계</dt>
              <dd>{state.response.relationshipLabel}</dd>
            </div>
            <div>
              <dt>알게 된 시점</dt>
              <dd>{state.response.knownSinceLabel}</dd>
            </div>
          </dl>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} data-kind="public">
        <p className={styles.brand}>겹 · {state.metadata.packTitle}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          이 사람과 어떤 사이인가요?
        </h1>
        <p>이름 없이 관계만 고르면 3장 질문을 시작해요.</p>
        <span className={styles.kind}>여러 친구가 함께 참여</span>
        <form className={styles.responseForm} onSubmit={submit}>
          <fieldset>
            <legend>우리 관계</legend>
            <div className={styles.options}>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <label className={styles.option} key={option.code}>
                  <input
                    type="radio"
                    name="relationship"
                    value={option.code}
                    checked={relationshipCode === option.code}
                    onChange={() => setRelationshipCode(option.code)}
                    disabled={starting}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>언제부터 알고 지냈나요?</legend>
            <p className={styles.help}>
              서로 알게 되거나 팔로우하기 시작한 때를 골라주세요.
            </p>
            <div className={styles.options}>
              {KNOWN_SINCE_OPTIONS.map((option) => (
                <label className={styles.option} key={option.code}>
                  <input
                    type="radio"
                    name="knownSince"
                    value={option.code}
                    checked={knownSinceCode === option.code}
                    onChange={() => setKnownSinceCode(option.code)}
                    disabled={starting}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {startError ? (
            <p className={styles.error} role="alert">
              {startError === "rate"
                ? "잠시 후 다시 시도해 주세요."
                : "연결을 확인하고 다시 시도해 주세요."}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!relationshipCode || !knownSinceCode || starting}
            aria-busy={starting}
          >
            {starting ? "시작하는 중…" : "3장 답하러 가기"}
          </button>
        </form>
      </section>
    </main>
  );
}
