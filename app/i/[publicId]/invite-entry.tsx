"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  buildManagementUrl,
  completeManagementRecord,
  ensurePendingManagementRecord,
  readManagementRecord,
  removeManagementRecord,
} from "@/lib/visitor-management/management-secret";
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
  readVisitorResponse,
  recordVisitorEvent,
  resumeVisitorResponse,
  saveVisitorAnswer,
  startVisitorResponse,
  submitVisitorAnswers,
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

const CONSUMED_INVITE_METADATA: InviteMetadata = Object.freeze({
  packSlug: "old-friend",
  packVersion: "v1",
  packTitle: "오래된 친구팩",
  kind: "one_to_one",
});

function unavailable(error: unknown) {
  return (
    (error instanceof ShareLinkHttpError && error.status === 404) ||
    (error instanceof VisitorResponseHttpError && error.status === 404)
  );
}

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
    void resumeVisitorResponse(publicId, fragment.secret)
      .then(async (response) => {
        try {
          const metadata = await readInviteMetadata(publicId, fragment.secret);
          return { metadata, response };
        } catch (error: unknown) {
          if (response && unavailable(error)) {
            return { metadata: CONSUMED_INVITE_METADATA, response };
          }
          throw error;
        }
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
        setState(
          unavailable(error) ? { kind: "unavailable" } : { kind: "retryable" },
        );
      });
    return () => {
      active = false;
    };
  }, [attempt, fragmentVersion, publicId]);

  const focusKey =
    state.kind === "active" && state.response
      ? state.response.status
      : state.kind;
  useEffect(() => {
    if (focusKey !== "loading") headingRef.current?.focus();
  }, [focusKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !publicId ||
      state.kind !== "active" ||
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
      if (unavailable(error)) {
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

  if (state.response) {
    return (
      <ResponseFlow
        initialResponse={state.response}
        packTitle={state.metadata.packTitle}
        headingRef={headingRef}
      />
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card} data-kind={state.metadata.kind}>
        <p className={styles.brand}>겹 · {state.metadata.packTitle}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          이 사람과 어떤 사이인가요?
        </h1>
        <p>이름 없이 관계만 고르면 3장 질문을 시작해요.</p>
        <span className={styles.kind}>
          {state.metadata.kind === "one_to_one"
            ? "나에게 온 1:1 초대"
            : "여러 친구가 함께 참여"}
        </span>
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

type DraftChoice = "a" | "b";
type PendingAnswer = Readonly<{ cardId: string; choice: DraftChoice }>;

function ResponseFlow({
  initialResponse,
  packTitle,
  headingRef,
}: {
  initialResponse: VisitorResponse;
  packTitle: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const initialChoices = Object.fromEntries(
    initialResponse.assignments.flatMap((assignment) =>
      assignment.visitorChoice
        ? [[assignment.cardId, assignment.visitorChoice]]
        : [],
    ),
  ) as Record<string, DraftChoice>;
  const [response, setResponse] = useState(initialResponse);
  const [choices, setChoices] = useState(initialChoices);
  const [position, setPosition] = useState(() => {
    const first = initialResponse.assignments.findIndex(
      ({ visitorChoice }) => visitorChoice === null,
    );
    return first === -1 ? 2 : first;
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [managementError, setManagementError] = useState(false);
  const queue = useRef<PendingAnswer[]>([]);
  const draining = useRef(false);
  const submittingLatch = useRef(false);
  const choicesRef = useRef(choices);

  useEffect(() => {
    if (response.status === "draft") headingRef.current?.focus();
  }, [headingRef, position, response.status]);

  const finish = useCallback(async () => {
    if (
      submittingLatch.current ||
      queue.current.length > 0 ||
      Object.keys(choicesRef.current).length !== 3
    ) {
      return;
    }
    submittingLatch.current = true;
    setSubmitting(true);
    setManagementError(false);
    try {
      const record = ensurePendingManagementRecord(response.id);
      const submitted = await submitVisitorAnswers(response.id, record.secret);
      try {
        completeManagementRecord(response.id);
      } catch {
        // The comparison is already committed; management recovery is shown below.
      }
      setResponse(submitted);
    } catch (error: unknown) {
      if (error instanceof VisitorResponseHttpError && error.status === 409) {
        try {
          const recovered = await readVisitorResponse(response.id);
          if (recovered.status === "submitted") {
            try {
              removeManagementRecord(response.id);
            } catch {
              // The comparison stays readable even when storage is unavailable.
            }
            setResponse(recovered);
            return;
          }
        } catch {
          // Fall through to the explicit recovery action.
        }
      }
      setManagementError(true);
    } finally {
      submittingLatch.current = false;
      setSubmitting(false);
    }
  }, [response.id]);

  async function drain() {
    if (draining.current) return;
    draining.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      while (queue.current.length > 0) {
        const next = queue.current.shift();
        if (!next) break;
        try {
          const saved = await saveVisitorAnswer(
            response.id,
            next.cardId,
            next.choice,
          );
          setResponse(saved);
        } catch {
          queue.current.unshift(next);
          setSaveError(true);
          return;
        }
      }
    } finally {
      draining.current = false;
      setSaving(false);
    }
    await finish();
  }

  function choose(cardId: string, choice: DraftChoice) {
    if (response.status !== "draft") return;
    const nextChoices = { ...choicesRef.current, [cardId]: choice };
    choicesRef.current = nextChoices;
    setChoices(nextChoices);
    queue.current.push({ cardId, choice });
    setPosition(Math.min(position + 1, 2));
    void drain();
  }

  useEffect(() => {
    if (
      response.status === "draft" &&
      Object.keys(choicesRef.current).length === 3 &&
      queue.current.length === 0 &&
      !saving &&
      !managementError
    ) {
      void finish();
    }
  }, [finish, managementError, response.status, saving]);

  if (response.status === "submitted") {
    return (
      <Comparison
        response={response}
        packTitle={packTitle}
        headingRef={headingRef}
      />
    );
  }

  const answered = Object.keys(choices).length;
  const assignment = response.assignments[position];
  const allChosen = answered === 3;

  return (
    <main className={styles.shell}>
      <section className={styles.card} data-kind="response">
        <p className={styles.brand}>겹 · {packTitle}</p>
        <div
          className={styles.progressRow}
          role="progressbar"
          aria-label="필수 답변 진행"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={answered}
          aria-valuetext={`3장 중 ${answered}장 답변 완료`}
        >
          <strong>{allChosen ? "답변 완료" : `${position + 1} / 3`}</strong>
          <span>{response.relationshipLabel}</span>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <span style={{ width: `${(answered / 3) * 100}%` }} />
        </div>
        {allChosen ? (
          <div className={styles.savingPanel} role="status">
            <h1 ref={headingRef} tabIndex={-1}>
              {managementError
                ? "비교를 마무리하지 못했어요"
                : "친구 답과 맞춰보는 중…"}
            </h1>
            <p>
              {managementError
                ? "저장된 답은 그대로예요. 다시 연결해 비교를 열어주세요."
                : "세 장을 안전하게 저장하고 바로 비교를 열게요."}
            </p>
            {saveError ? (
              <button type="button" onClick={() => void drain()}>
                답변 저장 다시 시도
              </button>
            ) : null}
            {managementError ? (
              <button
                type="button"
                onClick={() => void finish()}
                disabled={submitting}
              >
                {submitting ? "다시 연결하는 중…" : "비교 열기 다시 시도"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.question}>
            {assignment.isSignature ? (
              <span className={styles.signature}>SIGNATURE</span>
            ) : null}
            <h1 ref={headingRef} tabIndex={-1}>
              {assignment.visitorPrompt}
            </h1>
            <div className={styles.answerGrid}>
              {(["a", "b"] as const).map((choice) => (
                <button
                  className={styles.answer}
                  type="button"
                  key={choice}
                  onClick={() => choose(assignment.cardId, choice)}
                  disabled={saveError}
                  aria-pressed={choices[assignment.cardId] === choice}
                >
                  <small>{choice.toUpperCase()}</small>
                  <span>
                    {choice === "a" ? assignment.optionA : assignment.optionB}
                  </span>
                </button>
              ))}
            </div>
            <p className={styles.inlineStatus} aria-live="polite">
              {saveError
                ? "저장 실패 · 재시도"
                : saving
                  ? "저장 중…"
                  : answered > 0
                    ? "저장됨"
                    : "자동 저장"}
            </p>
            {saveError ? (
              <div className={styles.inlineError} role="alert">
                <p>답변을 저장하지 못했어요.</p>
                <button type="button" onClick={() => void drain()}>
                  다시 시도
                </button>
              </div>
            ) : null}
            <nav className={styles.questionNavigation} aria-label="질문 이동">
              <button
                type="button"
                onClick={() =>
                  setPosition((current) => Math.max(0, current - 1))
                }
                disabled={position === 0}
              >
                이전
              </button>
              {position < 2 && choices[assignment.cardId] ? (
                <button
                  type="button"
                  onClick={() =>
                    setPosition((current) => Math.min(2, current + 1))
                  }
                >
                  다음
                </button>
              ) : null}
            </nav>
          </div>
        )}
      </section>
    </main>
  );
}

function Comparison({
  response,
  packTitle,
  headingRef,
}: {
  response: Extract<VisitorResponse, { status: "submitted" }>;
  packTitle: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [copyState, setCopyState] = useState<
    "idle" | "copied" | "manual" | "missing"
  >("idle");
  const [managementUrl, setManagementUrl] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void recordVisitorEvent(response.id, "comparison_viewed").catch(
      () => undefined,
    );
    try {
      let record = readManagementRecord(response.id);
      if (record?.status === "pending") {
        try {
          record = completeManagementRecord(response.id);
        } catch {
          // A readable pending record still contains the committed capability.
        }
      }
      if (record) {
        const url = buildManagementUrl(window.location.origin, record.secret);
        queueMicrotask(() => setManagementUrl(url));
      } else {
        queueMicrotask(() => setCopyState("missing"));
      }
    } catch {
      try {
        removeManagementRecord(response.id);
      } catch {
        // Submitted responses never mint a replacement capability.
      }
      queueMicrotask(() => setCopyState("missing"));
    }
  }, [response.id]);

  async function copyManagementLink() {
    if (!managementUrl) {
      setCopyState("missing");
      return;
    }
    try {
      await navigator.clipboard.writeText(managementUrl);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  }

  return (
    <main className={styles.shell}>
      <section
        className={`${styles.card} ${styles.comparison}`}
        data-kind="comparison"
      >
        <p className={styles.brand}>겹 · {packTitle}</p>
        <span className={styles.resultKicker}>3장 비교 완료</span>
        <h1 ref={headingRef} tabIndex={-1}>
          {response.allMatched
            ? "우리, 생각보다 많이 겹쳐요"
            : "같은 사람을 다르게 보고 있었어요"}
        </h1>
        <p>
          {response.allMatched
            ? "세 항목을 모두 같게 봤어요"
            : "가장 선명하게 갈린 한 장을 먼저 표시했어요."}
        </p>
        <dl className={styles.savedContext}>
          <div>
            <dt>우리 관계</dt>
            <dd>{response.relationshipLabel}</dd>
          </div>
          <div>
            <dt>알게 된 시점</dt>
            <dd>{response.knownSinceLabel}</dd>
          </div>
        </dl>
        <div className={styles.comparisonList}>
          {response.assignments.map((assignment) => (
            <article
              className={
                assignment.isHighlight ? styles.highlight : styles.resultCard
              }
              key={assignment.cardId}
            >
              <div className={styles.resultHeader}>
                <span>{assignment.position}번째 질문</span>
                <strong>
                  <span className={styles.resultMarker} aria-hidden="true">
                    {assignment.matches ? "●" : "◆"}
                  </span>
                  <span>
                    {assignment.matches
                      ? "겹침"
                      : assignment.isHighlight
                        ? "가장 다른 답"
                        : "다름"}
                  </span>
                </strong>
              </div>
              <h2>{assignment.visitorPrompt}</h2>
              <dl>
                <div>
                  <dt>내가 본 이 사람</dt>
                  <dd>
                    {assignment.visitorChoice === "a"
                      ? assignment.optionA
                      : assignment.optionB}
                  </dd>
                </div>
                <div>
                  <dt>이 사람의 실제 답</dt>
                  <dd>
                    {assignment.ownerChoice === "a"
                      ? assignment.optionA
                      : assignment.optionB}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <Link
          className={styles.primaryCta}
          href="/play/new?pack=old-friend&source=same_pack_cta"
          onClick={() => {
            void recordVisitorEvent(
              response.id,
              "same_pack_start_clicked",
            ).catch(() => undefined);
          }}
        >
          나도 이 팩으로 시작하기
        </Link>
        <div className={styles.managementBox}>
          <h2>내 답변을 다시 보려면</h2>
          <p>
            관리 링크는 이 브라우저에서만 만들 수 있어요. 나에게 따로
            저장해두세요.
          </p>
          {managementUrl ? (
            <>
              <button type="button" onClick={() => void copyManagementLink()}>
                {copyState === "copied"
                  ? "관리 링크 복사됨"
                  : "내 관리 링크 복사"}
              </button>
              <p className={styles.copyStatus} aria-live="polite">
                {copyState === "copied"
                  ? "관리 링크를 복사했어요."
                  : copyState === "manual"
                    ? "자동 복사를 사용할 수 없어 직접 복사가 필요해요."
                    : ""}
              </p>
            </>
          ) : null}
          {copyState === "manual" ? (
            <div className={styles.manualCopy}>
              <label>
                직접 복사하기
                <input
                  ref={manualInputRef}
                  readOnly
                  value={managementUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  manualInputRef.current?.focus();
                  manualInputRef.current?.select();
                }}
              >
                전체 선택
              </button>
              <p>선택된 주소를 복사해 나에게 따로 저장해 주세요.</p>
            </div>
          ) : null}
          {copyState === "missing" ? (
            <p className={styles.error} role="alert">
              이 브라우저에서 관리 링크를 복구할 수 없어요. 비교 결과는 계속 볼
              수 있어요.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
