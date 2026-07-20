"use client";

import { useEffect, useRef, useState } from "react";

import {
  getPrivateOneToOneComparison,
  listPrivateOneToOneResponses,
  PrivateOneToOneHttpError,
} from "@/lib/private-one-to-one/private-one-to-one-client";
import type {
  PrivateOneToOneAssignment,
  PrivateOneToOneComparison,
  PrivateOneToOneResponseRow,
} from "@/lib/private-one-to-one/private-one-to-one";
import {
  knownSinceLabel,
  relationshipLabel,
} from "@/lib/visitor-response/visitor-context-core.mjs";

import styles from "./share-links.module.css";

type State =
  | { kind: "loading" }
  | { kind: "list"; responses: readonly PrivateOneToOneResponseRow[] }
  | { kind: "detail"; comparison: PrivateOneToOneComparison }
  | { kind: "error" };

function date(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function choice(assignment: PrivateOneToOneAssignment, value: "a" | "b") {
  return value === "a" ? assignment.optionA : assignment.optionB;
}

function ComparisonCard({
  assignment,
}: {
  assignment: PrivateOneToOneAssignment;
}) {
  return (
    <article
      className={
        assignment.isHighlight
          ? styles.comparisonHighlight
          : styles.comparisonCard
      }
    >
      <div className={styles.comparisonHeader}>
        <span>
          {assignment.stage === "required"
            ? `핵심 ${assignment.position}`
            : `더 보기 ${assignment.position}`}
        </span>
        <strong>
          <span aria-hidden="true">{assignment.matches ? "●" : "◆"}</span>{" "}
          {assignment.matches
            ? "겹침"
            : assignment.isHighlight
              ? "가장 다른 답"
              : "다름"}
        </strong>
      </div>
      <h3>{assignment.visitorPrompt}</h3>
      <dl>
        <div>
          <dt>내 실제 답</dt>
          <dd>{choice(assignment, assignment.ownerChoice)}</dd>
        </div>
        <div>
          <dt>친구가 본 나</dt>
          <dd>{choice(assignment, assignment.visitorChoice)}</dd>
        </div>
      </dl>
    </article>
  );
}

export default function PrivateOneToOnePanel({ playId }: { playId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusListAfterLoadRef = useRef(false);

  async function loadList(nextNotice: string | null = null) {
    focusListAfterLoadRef.current = true;
    setState({ kind: "loading" });
    setNotice(nextNotice);
    try {
      setState({
        kind: "list",
        responses: await listPrivateOneToOneResponses(playId),
      });
    } catch {
      setState({ kind: "error" });
    }
  }

  useEffect(() => {
    let active = true;
    void listPrivateOneToOneResponses(playId)
      .then((responses) => {
        if (active) setState({ kind: "list", responses });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [playId]);

  useEffect(() => {
    if (state.kind === "detail") {
      headingRef.current?.focus();
    } else if (state.kind === "list" && focusListAfterLoadRef.current) {
      focusListAfterLoadRef.current = false;
      headingRef.current?.focus();
    }
  }, [state.kind]);

  async function open(responseId: string) {
    if (busyId) return;
    setBusyId(responseId);
    setNotice(null);
    try {
      setState({
        kind: "detail",
        comparison: await getPrivateOneToOneComparison(playId, responseId),
      });
    } catch (error) {
      if (error instanceof PrivateOneToOneHttpError && error.status === 404) {
        await loadList("답변 상태가 바뀌어 목록을 다시 불러왔어요.");
      } else {
        setNotice("비교를 불러오지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (state.kind === "detail") {
    const comparison = state.comparison;
    return (
      <section
        className={styles.privateComparison}
        aria-labelledby="private-comparison-title"
      >
        <p className={styles.privateKicker}>주인과 답한 친구만 보는 결과</p>
        <h2 id="private-comparison-title" ref={headingRef} tabIndex={-1}>
          둘만 보는 1:1 비교
        </h2>
        <p className={styles.comparisonSummary}>
          {comparison.allMatched
            ? "핵심 3장의 답이 모두 겹쳤어요."
            : "서로 다르게 본 답도 있어서 더 재밌어요."}
        </p>
        <p className={styles.privateContext}>
          {relationshipLabel(comparison.relationshipCode)} ·{" "}
          {knownSinceLabel(comparison.knownSinceCode)} ·{" "}
          {date(comparison.submittedAt)}
        </p>
        <div className={styles.comparisonList}>
          {comparison.assignments.map((assignment) => (
            <ComparisonCard key={assignment.cardId} assignment={assignment} />
          ))}
        </div>
        <button
          className={styles.secondary}
          type="button"
          onClick={() => void loadList()}
        >
          1:1 목록으로
        </button>
      </section>
    );
  }

  return (
    <section
      className={styles.privateComparison}
      aria-labelledby="private-comparison-title"
    >
      <p className={styles.privateKicker}>이름 없이, 둘만 보는 결과</p>
      <h2 id="private-comparison-title" ref={headingRef} tabIndex={-1}>
        1:1로 본 우리
      </h2>
      <p className={styles.privateLead}>
        한 친구가 답을 마치면 서로의 선택을 카드별로 비교할 수 있어요.
      </p>
      {notice ? (
        <p className={styles.feedback} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {state.kind === "loading" ? (
        <p role="status">1:1 답변을 불러오는 중…</p>
      ) : state.kind === "error" ? (
        <div className={styles.privateEmpty}>
          <p role="alert">1:1 답변을 불러오지 못했어요.</p>
          <button type="button" onClick={() => void loadList()}>
            다시 시도
          </button>
        </div>
      ) : state.responses.length === 0 ? (
        <p className={styles.privateEmpty}>
          아직 완료된 1:1 답변이 없어요. 이름은 받지 않고, 답이 오면 여기에만
          보여드려요.
        </p>
      ) : (
        <ul className={styles.privateList}>
          {state.responses.map((response) => (
            <li key={response.id} data-status={response.status}>
              {response.status === "withdrawn" ? (
                <>
                  <div>
                    <strong>철회된 1:1 답변</strong>
                    <span>{date(response.withdrawnAt!)}</span>
                  </div>
                  <p>비교 내용은 남아 있지 않아요.</p>
                </>
              ) : (
                <>
                  <div>
                    <strong>
                      {relationshipLabel(response.relationshipCode!)} ·{" "}
                      {knownSinceLabel(response.knownSinceCode!)}
                    </strong>
                    <span>{date(response.submittedAt)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void open(response.id)}
                  >
                    {busyId === response.id ? "불러오는 중…" : "비교 보기"}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
