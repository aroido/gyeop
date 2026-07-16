"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./page.module.css";

const STORAGE_KEY = "gyeop:old-friend-play:v1";
const OPENING_MS = 1200;

type Card = {
  id: string;
  signature?: boolean;
  question: string;
  a: string;
  b: string;
};

const cards: readonly Card[] = [
  {
    id: "conflict",
    signature: true,
    question: "서운한 일이 생기면 나는?",
    a: "바로 이야기한다",
    b: "생각을 정리한 뒤 말한다",
  },
  {
    id: "reunion",
    question: "오랜만에 친구를 만나면 나는?",
    a: "어제 본 듯 바로 편해진다",
    b: "근황부터 천천히 맞춰 간다",
  },
  {
    id: "plans",
    question: "약속을 잡을 때 나는?",
    a: "미리 날짜를 정한다",
    b: "그때그때 편한 날을 본다",
  },
  {
    id: "comfort",
    question: "친구가 고민을 털어놓으면 나는?",
    a: "먼저 끝까지 들어준다",
    b: "해결 방법부터 같이 찾는다",
  },
  {
    id: "gathering",
    question: "여러 친구가 모인 자리에서 나는?",
    a: "먼저 분위기를 띄운다",
    b: "익숙한 사람 곁에서 시작한다",
  },
  {
    id: "reconnect",
    question: "연락이 뜸해졌을 때 나는?",
    a: "짧게 안부부터 보낸다",
    b: "만날 약속부터 잡는다",
  },
  {
    id: "memory",
    question: "옛날 이야기가 나오면 나는?",
    a: "구체적인 장면부터 떠올린다",
    b: "그때 느낀 감정부터 떠올린다",
  },
  {
    id: "travel",
    question: "친구와 여행 일정을 정할 때 나는?",
    a: "미리 계획을 세운다",
    b: "현장에서 그때그때 정한다",
  },
  {
    id: "celebration",
    question: "친구의 좋은 소식을 들은 직후 나는?",
    a: "바로 연락해 축하한다",
    b: "다음에 만날 때 직접 축하한다",
  },
  {
    id: "hard-day",
    question: "힘든 날에 나는?",
    a: "먼저 연락해 털어놓는다",
    b: "혼자 정리한 뒤 연락한다",
  },
];

type Answer = "a" | "b";
type Answers = Record<string, Answer>;

type Draft = {
  currentIndex: number;
  answers: Answers;
  completed: boolean;
};

const emptyDraft: Draft = { currentIndex: 0, answers: {}, completed: false };
const cardIds = new Set<string>(cards.map((card) => card.id));

function readDraft(raw: string | null): Draft {
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

export default function OldFriendPlay() {
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window === "undefined") return emptyDraft;
    try {
      return readDraft(window.localStorage.getItem(STORAGE_KEY));
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
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, currentIndex, answers }),
      );
    } catch {
      // ponytail: storage can be unavailable; React state is the fallback.
    }
  }, [answers, currentIndex]);

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
      window.localStorage.removeItem(STORAGE_KEY);
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
          <p>오래된 친구팩</p>
          <h1 id="opening-title">질문 카드를 여는 중이에요</h1>
        </section>
      </main>
    );
  }

  if (completed) {
    return (
      <main className={styles.shell}>
        <section className={styles.complete} aria-labelledby="complete-title">
          <p className={styles.brand}>겹 · 오래된 친구팩</p>
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
          <p className={styles.brand}>겹 · 오래된 친구팩</p>
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
          {card.signature ? (
            <p className={styles.signature}>모든 친구에게 묻는 대표 질문</p>
          ) : null}
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
