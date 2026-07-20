"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  decodeOwnerFlow,
  isOwnerFlowReadyToComplete,
  ownerFlowReducer,
  ownerSaveStatus,
} from "@/lib/owner-flow/owner-flow-core.mjs";
import {
  clearOwnerSession,
  completeOwnerPlay,
  loadOwnerFlow,
  type OwnerPack,
  OwnerFlowHttpError,
  readOwnerPlay,
  saveOwnerAnswer,
} from "@/lib/owner-flow/owner-flow-client";
import type { OwnerPlayState } from "@/lib/owner-play/owner-play-session";

import styles from "./page.module.css";

type Choice = "a" | "b";
type SaveOperation = Readonly<{
  sequence: number;
  cardId: string;
  choice: Choice;
  currentPosition: number;
}>;
type Flow = Readonly<{
  phase: "draft" | "completed";
  play: OwnerPlayState;
  pack: OwnerPack;
  answers: Readonly<Record<string, Choice>>;
  currentIndex: number;
  queue: readonly SaveOperation[];
  nextSequence: number;
  inFlightSequence: number | null;
  failedSequence: number | null;
  hasSaved: boolean;
  completion: "idle" | "in-flight" | "retryable" | "completed";
}>;
type LoadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "retryable" }
  | { kind: "terminal" };

function isRetryable(error: unknown) {
  return (
    !(error instanceof OwnerFlowHttpError) ||
    error.status === 429 ||
    error.status >= 500
  );
}

function matchesFlow(play: Flow["play"], flow: Flow) {
  return (
    play.id === flow.play.id &&
    play.packSlug === flow.pack.slug &&
    play.packVersion === flow.pack.version
  );
}

function ExitDialog({
  unsafe,
  onClose,
  onLeave,
}: {
  unsafe: boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
  }, []);

  function close() {
    ref.current?.close();
  }

  return (
    <dialog
      className={styles.dialog}
      ref={ref}
      aria-labelledby="exit-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={onClose}
    >
      <h2 id="exit-title">
        {unsafe ? "아직 저장하지 못한 답이 있어요" : "지금까지 자동 저장됐어요"}
      </h2>
      <p>
        {unsafe
          ? "지금 나가면 저장 중이거나 실패한 선택이 사라질 수 있어요."
          : "같은 브라우저에서 다시 열면 이어서 답할 수 있어요."}
      </p>
      <div className={styles.dialogActions}>
        <button type="button" onClick={close} autoFocus>
          계속 답하기
        </button>
        <button type="button" onClick={onLeave}>
          {unsafe ? "그래도 나가기" : "홈으로 가기"}
        </button>
      </div>
    </dialog>
  );
}

function TerminalScreen({
  retryable,
  onRetry,
}: {
  retryable: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [clearing, setClearing] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function startNew() {
    if (clearing) return;
    setClearing(true);
    setClearFailed(false);
    try {
      await clearOwnerSession();
      router.replace("/");
    } catch {
      setClearing(false);
      setClearFailed(true);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.message} aria-labelledby="ended-title">
        <p className={styles.brand}>겹 · 질문팩</p>
        <h1 id="ended-title" ref={headingRef} tabIndex={-1}>
          이 팩을 이어갈 수 없어요
        </h1>
        <p>진행 정보가 만료됐거나 이 브라우저에서 열 수 없는 팩이에요.</p>
        <div className={styles.messageActions}>
          {retryable ? (
            <button type="button" onClick={onRetry}>
              다시 불러오기
            </button>
          ) : null}
          <button type="button" onClick={startNew} disabled={clearing}>
            {clearing ? "홈으로 이동하는 중…" : "다른 팩 고르기"}
          </button>
        </div>
        {clearFailed ? (
          <p className={styles.error} role="alert">
            새 팩을 시작하지 못했어요. 다시 시도해 주세요.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export default function OwnerPlay({ playId }: { playId: string | null }) {
  const router = useRouter();
  const [loadKey, setLoadKey] = useState(0);
  const [load, setLoad] = useState<LoadState>(
    playId ? { kind: "loading" } : { kind: "terminal" },
  );
  const [flow, setFlow] = useState<Flow | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveFlightRef = useRef<number | null>(null);
  const completionFlightRef = useRef(false);
  const currentIndex = flow?.currentIndex;
  const phase = flow?.phase;

  useEffect(() => {
    if (!playId) return;
    let active = true;
    void loadOwnerFlow(playId)
      .then(({ play, pack }) => {
        if (!active) return;
        setFlow(decodeOwnerFlow(play, pack));
        setLoad({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoad({ kind: isRetryable(error) ? "retryable" : "terminal" });
      });
    return () => {
      active = false;
    };
  }, [loadKey, playId]);

  useEffect(() => {
    if (phase !== "draft" && phase !== "completed") return;
    const frame = window.requestAnimationFrame(() =>
      headingRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [currentIndex, phase]);

  useEffect(() => {
    if (!flow) return;
    const pending =
      flow.queue.length > 0 ||
      flow.inFlightSequence !== null ||
      flow.failedSequence !== null;
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [flow]);

  useEffect(() => {
    if (
      !flow ||
      flow.phase !== "draft" ||
      flow.queue.length === 0 ||
      flow.inFlightSequence !== null ||
      flow.failedSequence !== null ||
      saveFlightRef.current !== null
    ) {
      return;
    }
    const operation = flow.queue[0];
    saveFlightRef.current = operation.sequence;
    setFlow((current) =>
      current
        ? ownerFlowReducer(current, {
            type: "save-started",
            sequence: operation.sequence,
          })
        : current,
    );
    void saveOwnerAnswer({
      playId: flow.play.id,
      cardId: operation.cardId,
      choice: operation.choice,
      currentPosition: operation.currentPosition,
    })
      .then(async (play) => {
        const current = flow;
        if (!matchesFlow(play, current)) {
          setLoad({ kind: "terminal" });
          setFlow(null);
          return;
        }
        if (play.status === "completed") {
          setFlow((value) =>
            value
              ? ownerFlowReducer(value, {
                  type: "completion-succeeded",
                  play,
                })
              : value,
          );
          return;
        }
        setFlow((value) =>
          value
            ? ownerFlowReducer(value, {
                type: "save-succeeded",
                sequence: operation.sequence,
                play,
              })
            : value,
        );
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof OwnerFlowHttpError &&
          error.code === "OWNER_PLAY_COMPLETED"
        ) {
          try {
            const play = await readOwnerPlay(flow.play.id);
            if (play.status === "completed" && matchesFlow(play, flow)) {
              setFlow((value) =>
                value
                  ? ownerFlowReducer(value, {
                      type: "completion-succeeded",
                      play,
                    })
                  : value,
              );
              return;
            }
          } catch {
            // The same generic terminal path is used below.
          }
          setLoad({ kind: "terminal" });
          setFlow(null);
          return;
        }
        if (isRetryable(error)) {
          setFlow((value) =>
            value
              ? ownerFlowReducer(value, {
                  type: "save-failed",
                  sequence: operation.sequence,
                })
              : value,
          );
          return;
        }
        setLoad({ kind: "terminal" });
        setFlow(null);
      })
      .finally(() => {
        if (saveFlightRef.current === operation.sequence) {
          saveFlightRef.current = null;
        }
      });
  }, [flow]);

  useEffect(() => {
    if (
      !flow ||
      !isOwnerFlowReadyToComplete(flow) ||
      completionFlightRef.current
    ) {
      return;
    }
    completionFlightRef.current = true;
    setFlow((current) =>
      current
        ? ownerFlowReducer(current, { type: "completion-started" })
        : current,
    );
    void completeOwnerPlay(flow.play.id)
      .then((play) => {
        if (play.status !== "completed" || !matchesFlow(play, flow)) {
          setLoad({ kind: "terminal" });
          setFlow(null);
          return;
        }
        setFlow((value) =>
          value
            ? ownerFlowReducer(value, {
                type: "completion-succeeded",
                play,
              })
            : value,
        );
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof OwnerFlowHttpError &&
          error.code === "OWNER_PLAY_INCOMPLETE"
        ) {
          try {
            const play = await readOwnerPlay(flow.play.id);
            if (!matchesFlow(play, flow)) throw new Error("mismatch");
            setFlow((value) =>
              value
                ? ownerFlowReducer(
                    value,
                    play.status === "completed"
                      ? { type: "completion-succeeded", play }
                      : { type: "incomplete-refreshed", play },
                  )
                : value,
            );
            return;
          } catch {
            setLoad({ kind: "terminal" });
            setFlow(null);
            return;
          }
        }
        if (isRetryable(error)) {
          setFlow((value) =>
            value
              ? ownerFlowReducer(value, { type: "completion-failed" })
              : value,
          );
          return;
        }
        setLoad({ kind: "terminal" });
        setFlow(null);
      })
      .finally(() => {
        completionFlightRef.current = false;
      });
  }, [flow]);

  if (load.kind === "loading") {
    return (
      <main className={styles.shell}>
        <p className={styles.loading} role="status">
          저장한 답을 불러오는 중…
        </p>
      </main>
    );
  }

  if (load.kind === "retryable" || load.kind === "terminal" || !flow) {
    return (
      <TerminalScreen
        retryable={load.kind === "retryable"}
        onRetry={() => {
          setFlow(null);
          setLoad({ kind: "loading" });
          setLoadKey((key) => key + 1);
        }}
      />
    );
  }

  if (flow.phase === "completed") {
    return (
      <main className={styles.shell} data-pack={flow.pack.slug}>
        <section
          className={styles.complete}
          aria-labelledby="complete-title"
          data-testid="complete-screen"
        >
          <p className={styles.brand}>겹 · {flow.pack.title}</p>
          <h1 id="complete-title" ref={headingRef} tabIndex={-1}>
            내 답변 10개가 저장됐어요
          </h1>
          <p className={styles.completeCopy}>
            다음은 친구에게 공유하기예요. 친구의 시선이 내 답 위에 어떻게
            겹치는지 확인하게 됩니다.
          </p>
          <ol className={styles.summary} aria-label="내 선택 10장">
            {flow.pack.cards.map((card, index) => {
              const choice = flow.answers[card.id];
              return (
                <li key={card.id}>
                  <span>{index + 1}</span>
                  <div>
                    <p>{card.ownerPrompt}</p>
                    <strong>
                      {choice === "a" ? card.optionA : card.optionB}
                    </strong>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            className={styles.homeButton}
            onClick={() => {
              const returnTo = `/me/plays/${flow.play.id}`;
              router.push(
                `/auth/sign-in?playId=${flow.play.id}&returnTo=${encodeURIComponent(returnTo)}`,
              );
            }}
          >
            내 질문팩 저장하고 공유하기
          </button>
        </section>
      </main>
    );
  }

  const card = flow.pack.cards[flow.currentIndex];
  const selected = flow.answers[card.id];
  const saveStatus = ownerSaveStatus(flow);
  const unsafeExit =
    flow.queue.length > 0 ||
    flow.inFlightSequence !== null ||
    flow.failedSequence !== null;
  const statusCopy = {
    auto: "자동 저장",
    saving: "저장 중…",
    saved: "저장됨",
    failed: "저장 실패 · 재시도",
  }[saveStatus];

  return (
    <main className={styles.shell} data-pack={flow.pack.slug}>
      <section className={styles.play} aria-labelledby="question-title">
        <header className={styles.navHeader}>
          <button
            type="button"
            onClick={() =>
              setFlow((value) =>
                value ? ownerFlowReducer(value, { type: "previous" }) : value,
              )
            }
            disabled={flow.currentIndex === 0}
          >
            이전
          </button>
          <p className={styles.brand}>겹 · {flow.pack.title}</p>
          <button type="button" onClick={() => setExitOpen(true)}>
            나가기
          </button>
        </header>

        <div className={styles.progressHeader}>
          <span aria-hidden="true">
            {flow.currentIndex + 1} / {flow.pack.cards.length}
          </span>
          {saveStatus === "failed" ? (
            <button
              className={styles.saveChip}
              data-state={saveStatus}
              type="button"
              onClick={() =>
                setFlow((value) =>
                  value
                    ? ownerFlowReducer(value, { type: "retry-save" })
                    : value,
                )
              }
            >
              {statusCopy}
            </button>
          ) : (
            <span className={styles.saveChip} data-state={saveStatus}>
              {statusCopy}
            </span>
          )}
        </div>
        <span className={styles.live} aria-live="polite" aria-atomic="true">
          {statusCopy}
        </span>

        <progress
          className={styles.progress}
          aria-label="질문 진행률"
          value={flow.currentIndex + 1}
          max={flow.pack.cards.length}
        />

        <div className={styles.questionCard} data-testid="question-card">
          <h1 id="question-title" ref={headingRef} tabIndex={-1}>
            {card.ownerPrompt}
          </h1>
          <div className={styles.choices}>
            {(["a", "b"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                data-choice={choice}
                aria-pressed={selected === choice}
                disabled={flow.completion === "in-flight"}
                onClick={() =>
                  setFlow((value) =>
                    value
                      ? ownerFlowReducer(value, {
                          type: "choose",
                          cardId: card.id,
                          choice,
                        })
                      : value,
                  )
                }
              >
                <span>{choice.toUpperCase()}</span>
                {choice === "a" ? card.optionA : card.optionB}
              </button>
            ))}
          </div>
        </div>

        {flow.completion === "in-flight" ? (
          <p className={styles.completionStatus} role="status">
            답변을 완료하는 중…
          </p>
        ) : null}
        {flow.completion === "retryable" ? (
          <button
            className={styles.completionRetry}
            type="button"
            onClick={() =>
              setFlow((value) =>
                value
                  ? ownerFlowReducer(value, { type: "completion-retry" })
                  : value,
              )
            }
          >
            완료 다시 시도
          </button>
        ) : null}
      </section>

      {exitOpen ? (
        <ExitDialog
          unsafe={unsafeExit}
          onClose={() => setExitOpen(false)}
          onLeave={() => router.push("/")}
        />
      ) : null}
    </main>
  );
}
