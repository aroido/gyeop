"use client";

import { useEffect, useRef, useState } from "react";

import type { Pack, PackCard } from "../packs";
import styles from "./page.module.css";

const OPENING_MS = 1200;

type Answer = "a" | "b";
type Answers = Record<string, Answer>;

type Draft = {
  currentIndex: number;
  answers: Answers;
  completed: boolean;
};

const emptyDraft: Draft = { currentIndex: 0, answers: {}, completed: false };

function readDraft(raw: string | null, cards: readonly PackCard[]): Draft {
  if (!raw) return emptyDraft;

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return emptyDraft;
    }

    const candidate = value as {
      version?: unknown;
      currentIndex?: unknown;
      answers?: unknown;
    };
    if (
      candidate.version !== 1 ||
      !Number.isInteger(candidate.currentIndex) ||
      (candidate.currentIndex as number) < 0 ||
      (candidate.currentIndex as number) >= cards.length ||
      !candidate.answers ||
      typeof candidate.answers !== "object" ||
      Array.isArray(candidate.answers)
    ) {
      return emptyDraft;
    }

    const cardIds = new Set(cards.map((card) => card.id));
    const entries = Object.entries(candidate.answers);
    if (
      entries.some(
        ([id, answer]) =>
          !cardIds.has(id) || (answer !== "a" && answer !== "b"),
      )
    ) {
      return emptyDraft;
    }

    const answers = Object.fromEntries(entries) as Answers;
    const firstUnanswered = cards.findIndex((card) => !answers[card.id]);
    if (firstUnanswered === -1) {
      return { currentIndex: cards.length - 1, answers, completed: true };
    }

    return {
      currentIndex: Math.min(candidate.currentIndex as number, firstUnanswered),
      answers,
      completed: false,
    };
  } catch {
    return emptyDraft;
  }
}

export default function PackPlay({ pack }: { pack: Pack }) {
  const { cards, storageKey, title } = pack;
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window === "undefined") return emptyDraft;
    try {
      return readDraft(window.localStorage.getItem(storageKey), cards);
    } catch {
      return emptyDraft;
    }
  });
  const [opening, setOpening] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { answers, completed, currentIndex } = draft;

  useEffect(() => {
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : OPENING_MS;
    const timer = window.setTimeout(() => setOpening(false), delay);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      if (currentIndex === 0 && Object.keys(answers).length === 0) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, currentIndex, answers }),
      );
    } catch {
      // ponytail: storage can be unavailable; React state is the fallback.
    }
  }, [answers, currentIndex, storageKey]);

  useEffect(() => {
    if (opening) return;
    const frame = window.requestAnimationFrame(() =>
      headingRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [completed, currentIndex, opening]);

  const card = cards[currentIndex];
  const selected = answers[card.id];

  function choose(answer: Answer) {
    const nextAnswers = { ...answers, [card.id]: answer };
    setDraft({
      answers: nextAnswers,
      completed: Object.keys(nextAnswers).length === cards.length,
      currentIndex: Math.min(currentIndex + 1, cards.length - 1),
    });
  }

  function restart() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // The in-memory reset still succeeds.
    }
    setDraft(emptyDraft);
  }

  if (opening) {
    return (
      <main className={styles.shell}>
        <section className={styles.opening} aria-labelledby="opening-title">
          <div className={styles.openingCard} aria-hidden="true">
            <span>겹</span>
          </div>
          <p>{title}</p>
          <h1 id="opening-title">질문 카드를 여는 중이에요</h1>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className={styles.shell}>
        <section className={styles.complete} aria-labelledby="complete-title">
          <p className={styles.brand}>겹 · {title}</p>
          <h1 id="complete-title" ref={headingRef} tabIndex={-1}>
            나의 10장을 모두 골랐어요
          </h1>
          <p className={styles.completeCopy}>
            지금은 로컬 확인용이에요. 다음 단계에서 링크를 보내면 친구의 선택이
            이 답 위에 겹쳐집니다.
          </p>

          <ol className={styles.summary} aria-label="내 선택 10장">
            {cards.map((summaryCard, index) => {
              const answer = answers[summaryCard.id];
              return (
                <li key={summaryCard.id}>
                  <span>{index + 1}</span>
                  <div>
                    <p>{summaryCard.question}</p>
                    <strong>{answer ? summaryCard[answer] : "미응답"}</strong>
                  </div>
                </li>
              );
            })}
          </ol>

          <button className={styles.restart} type="button" onClick={restart}>
            처음부터 다시 하기
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.play} aria-labelledby="question-title">
        <header className={styles.progressHeader}>
          <p className={styles.brand}>겹 · {title}</p>
          <span aria-hidden="true">
            {currentIndex + 1} / {cards.length}
          </span>
        </header>

        <progress
          className={styles.progress}
          aria-label="질문 진행률"
          value={currentIndex + 1}
          max={cards.length}
        />

        <div className={styles.questionCard}>
          <h1 id="question-title" ref={headingRef} tabIndex={-1}>
            {card.question}
          </h1>

          <div className={styles.choices}>
            <button
              type="button"
              data-choice="a"
              aria-pressed={selected === "a"}
              onClick={() => choose("a")}
            >
              <span>A</span>
              {card.a}
            </button>
            <button
              type="button"
              data-choice="b"
              aria-pressed={selected === "b"}
              onClick={() => choose("b")}
            >
              <span>B</span>
              {card.b}
            </button>
          </div>
        </div>

        {currentIndex > 0 ? (
          <button
            className={styles.previous}
            type="button"
            onClick={() =>
              setDraft({ ...draft, currentIndex: currentIndex - 1 })
            }
          >
            이전 질문
          </button>
        ) : null}

        <p className={styles.live} aria-live="polite">
          질문 {currentIndex + 1} / {cards.length}
        </p>
      </section>
    </main>
  );
}
