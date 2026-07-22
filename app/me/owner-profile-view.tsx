"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  OWNER_PROFILE_WATERMARK_KEY,
  deriveOwnerSightNotice,
  parseOwnerProfileWatermark,
  serializeOwnerProfileWatermark,
} from "@/lib/owner-profile/owner-profile-core.mjs";
import {
  loadOwnerProfile,
  OwnerProfileHttpError,
  recordOwnerProfileReshareClicked,
  recordOwnerProfileViewed,
} from "@/lib/owner-profile/owner-profile-client";
import type {
  OwnerProfile,
  OwnerProfileCard,
} from "@/lib/owner-profile/owner-profile";

import styles from "./owner-profile.module.css";

type SightNotice = "empty" | "new" | "existing";
type State =
  | { kind: "loading" }
  | { kind: "auth" }
  | { kind: "terminal" }
  | { kind: "ready"; profile: OwnerProfile; notice: SightNotice };

function readNotice(profile: OwnerProfile): SightNotice {
  let storageAvailable = true;
  let watermark = parseOwnerProfileWatermark(null);
  try {
    watermark = parseOwnerProfileWatermark(
      window.localStorage.getItem(OWNER_PROFILE_WATERMARK_KEY),
    );
    window.localStorage.setItem(
      OWNER_PROFILE_WATERMARK_KEY,
      serializeOwnerProfileWatermark(profile),
    );
  } catch {
    storageAvailable = false;
  }
  return deriveOwnerSightNotice(
    profile,
    watermark,
    storageAvailable,
  ) as SightNotice;
}

function Choice({
  label,
  value,
  selected,
}: {
  label: "A" | "B";
  value: string;
  selected: boolean;
}) {
  return (
    <div className={styles.choice} data-selected={selected}>
      <span aria-hidden="true">{label}</span>
      <p>{value}</p>
      {selected ? <strong>내 선택</strong> : null}
    </div>
  );
}

function Aggregate({ card }: { card: OwnerProfileCard }) {
  if (card.counts === null) {
    return (
      <div className={styles.pending}>
        <strong>시선을 모으는 중 · {card.sampleCount}/3</strong>
        <p>친구가 이 질문을 만날 때마다 한 표본이 쌓여요.</p>
      </div>
    );
  }
  return (
    <div
      className={styles.aggregate}
      aria-label={`친구 시선 ${card.sampleCount}개`}
    >
      <p className={styles.aggregateTitle}>친구 시선 · {card.sampleCount}</p>
      <div>
        <span>A · {card.optionA}</span>
        <strong>{card.counts.a}명</strong>
      </div>
      <div>
        <span>B · {card.optionB}</span>
        <strong>{card.counts.b}명</strong>
      </div>
    </div>
  );
}

function ProfileCard({ card }: { card: OwnerProfileCard }) {
  return (
    <article className={styles.card}>
      <p className={styles.position}>
        {String(card.position).padStart(2, "0")}
      </p>
      <h2>{card.ownerPrompt}</h2>
      <div className={styles.choices}>
        <Choice
          label="A"
          value={card.optionA}
          selected={card.selfChoice === "a"}
        />
        <Choice
          label="B"
          value={card.optionB}
          selected={card.selfChoice === "b"}
        />
      </div>
      <Aggregate card={card} />
    </article>
  );
}

export default function OwnerProfileView({
  playId,
}: {
  playId: string | null;
}) {
  const [state, setState] = useState<State>(
    playId ? { kind: "loading" } : { kind: "terminal" },
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const eventPlayRef = useRef<string | null>(null);
  const reshareClickRef = useRef(false);

  useEffect(() => {
    const refreshRestoredPage = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setState({ kind: "loading" });
      window.location.reload();
    };
    window.addEventListener("pageshow", refreshRestoredPage);
    return () => window.removeEventListener("pageshow", refreshRestoredPage);
  }, []);

  useEffect(() => {
    let active = true;
    if (!playId) return;
    void loadOwnerProfile(playId)
      .then((profile) => {
        if (active) {
          setState({ kind: "ready", profile, notice: readNotice(profile) });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind:
              error instanceof OwnerProfileHttpError && error.status === 401
                ? "auth"
                : "terminal",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [playId, refreshVersion]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        setRefreshVersion((value) => value + 1);
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, []);

  useEffect(() => {
    if (state.kind !== "loading") headingRef.current?.focus();
    if (
      state.kind !== "ready" ||
      eventPlayRef.current === state.profile.playId
    ) {
      return;
    }
    eventPlayRef.current = state.profile.playId;
    void recordOwnerProfileViewed(state.profile.playId).catch(() => undefined);
  }, [state]);

  if (state.kind === "loading") {
    return (
      <section className={styles.shell}>
        <p role="status">내 시선을 불러오는 중…</p>
      </section>
    );
  }

  if (state.kind === "terminal") {
    return (
      <section className={styles.shell}>
        <section className={styles.terminal}>
          <p className={styles.brand}>겹</p>
          <h1 ref={headingRef} tabIndex={-1}>
            이 프로필을 열 수 없어요
          </h1>
          <p>진행 정보가 만료됐거나 이 브라우저에서 열 수 없는 프로필이에요.</p>
          <Link className={styles.primary} href="/">
            홈으로
          </Link>
        </section>
      </section>
    );
  }

  if (state.kind === "auth") {
    return (
      <section className={styles.shell}>
        <section className={styles.terminal}>
          <p className={styles.brand}>겹</p>
          <h1 ref={headingRef} tabIndex={-1}>
            다시 로그인해 주세요
          </h1>
          <p>계정을 확인하면 저장해 둔 내 시선 프로필을 다시 볼 수 있어요.</p>
          <Link className={styles.primary} href="/auth/sign-in?returnTo=%2Fme">
            Google로 로그인
          </Link>
        </section>
      </section>
    );
  }

  const { profile, notice } = state;
  return (
    <section className={styles.shell}>
      <section className={styles.profile} aria-labelledby="profile-title">
        <nav className={styles.ownerNav} aria-label="내 질문팩 이동">
          <Link className={styles.back} href="/me">
            내 질문팩
          </Link>
          <Link className={styles.back} href={`/play/${profile.playId}`}>
            ← 내 답변
          </Link>
        </nav>
        <p className={styles.brand}>겹 · {profile.packTitle}</p>
        <h1 id="profile-title" ref={headingRef} tabIndex={-1}>
          내 시선 프로필
        </h1>
        <p className={styles.lead}>
          내가 보는 나와 친구가 보는 내가 한 장씩 겹쳐지고 있어요.
        </p>

        <section className={styles.summary} aria-labelledby="sight-summary">
          <p id="sight-summary">공개 링크로 도착한 시선</p>
          <strong>{profile.sightCount}</strong>
          {notice === "new" ? (
            <span className={styles.notice}>새 시선 도착</span>
          ) : null}
          {notice === "existing" ? (
            <span className={styles.notice}>시선이 쌓여 있어요</span>
          ) : null}
          {notice === "empty" ? (
            <span className={styles.emptyNotice}>
              아직 도착한 시선이 없어요
            </span>
          ) : null}
          {profile.sightCount > 0 ? (
            <div className={styles.reshare}>
              <p>같은 팩 링크로 친구 시선을 더 받아요.</p>
              <Link
                className={styles.primary}
                href={`/me/plays/${profile.playId}?entry_source=profile_reshare`}
                onClick={() => {
                  if (reshareClickRef.current) return;
                  reshareClickRef.current = true;
                  void recordOwnerProfileReshareClicked(profile.playId).catch(
                    () => undefined,
                  );
                }}
              >
                시선 더 모으기
              </Link>
            </div>
          ) : null}
        </section>

        <div className={styles.sectionHead}>
          <p>내가 보는 나</p>
          <strong>10장</strong>
        </div>
        <div className={styles.cards}>
          {profile.cards.map((card) => (
            <ProfileCard key={card.cardId} card={card} />
          ))}
        </div>
      </section>
    </section>
  );
}
