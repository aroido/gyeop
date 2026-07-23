"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  OWNER_PROFILE_WATERMARK_KEY,
  deriveOwnerSightNotice,
  initialOwnerProfileRelationshipCode,
  parseOwnerProfileWatermark,
  serializeOwnerProfileWatermark,
} from "@/lib/owner-profile/owner-profile-core.mjs";
import {
  buildProfileShareCardModel,
  isProfileShareRelationship,
} from "@/lib/owner-profile/profile-share-card-core.mjs";
import {
  loadOwnerProfile,
  OwnerProfileHttpError,
  recordOwnerProfileReshareClicked,
  recordOwnerProfileViewed,
} from "@/lib/owner-profile/owner-profile-client";
import type {
  OwnerProfile,
  OwnerProfileCard,
  ProfileShareSelection,
  OwnerProfileRelationshipCard,
  OwnerProfileRelationshipLayer,
} from "@/lib/owner-profile/owner-profile";
import { relationshipLabel } from "@/lib/visitor-response/visitor-context-core.mjs";

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
      <span aria-hidden="true">{selected ? "✓" : label}</span>
      <p>{value}</p>
      {selected ? <strong>내 선택</strong> : null}
    </div>
  );
}

function AvailableQuestion({
  card,
  relationshipCard,
  relationshipCode,
  label,
  onShare,
  playId,
  shareDisabled,
}: {
  card: OwnerProfileCard;
  relationshipCard: Extract<
    OwnerProfileRelationshipCard,
    { status: "available" }
  >;
  relationshipCode: string;
  label: string;
  onShare: () => void;
  playId: string;
  shareDisabled: boolean;
}) {
  const shareable =
    !shareDisabled && isProfileShareRelationship(relationshipCode);
  const shareHref = `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=${encodeURIComponent(
    relationshipCode,
  )}&share_card=${encodeURIComponent(card.cardId)}`;
  return (
    <article
      className={styles.insightCard}
      id={shareable ? "shareable-insight" : undefined}
    >
      <div className={styles.cardEyebrow}>
        <span>{label} 시선</span>
        <strong>첫 시선 공개</strong>
      </div>
      <h3>{card.ownerPrompt}</h3>
      <p className={styles.selectionLabel}>내 선택</p>
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
      <div
        className={styles.aggregate}
        aria-label={`${label} 시선 ${relationshipCard.sampleCount}개`}
      >
        <p>{label} 시선</p>
        <div>
          <span>{card.optionA}</span>
          <strong>{relationshipCard.counts.a}명</strong>
        </div>
        <div>
          <span>{card.optionB}</span>
          <strong>{relationshipCard.counts.b}명</strong>
        </div>
      </div>
      {shareable ? (
        <Link
          className={styles.shareInsight}
          href={shareHref}
          onClick={onShare}
        >
          이 시선 카드 공유하기
        </Link>
      ) : null}
    </article>
  );
}

function CollectingQuestion({
  card,
  relationshipCard,
}: {
  card: OwnerProfileCard;
  relationshipCard: Extract<
    OwnerProfileRelationshipCard,
    { status: "collecting" }
  >;
}) {
  return (
    <article className={styles.collectingCard}>
      <div className={styles.cardEyebrow}>
        <span>다음 질문 · 시선을 모으는 중</span>
        <strong>{relationshipCard.sampleCount}/3</strong>
      </div>
      <h3>{card.ownerPrompt}</h3>
      <p>응답이 3개 모이면 내 선택과 관계별 시선을 함께 보여드려요.</p>
    </article>
  );
}

function LayerContent({
  layer,
  onShare,
  playId,
  preferredCardId,
  profile,
  shareDisabled,
}: {
  layer: OwnerProfileRelationshipLayer;
  onShare: () => void;
  playId: string;
  preferredCardId: string | null;
  profile: OwnerProfile;
  shareDisabled: boolean;
}) {
  const label = relationshipLabel(layer.relationshipCode) as string;
  if (layer.status === "collecting") {
    return (
      <section className={styles.lockedLayer} aria-live="polite">
        <strong>{label}</strong>
        <span>시선을 모으는 중 · {layer.sightCount}/3</span>
        <p>관계 시선이 3개 모이면 질문별 집계를 열어요.</p>
      </section>
    );
  }

  const available = layer.cards.find(
    (
      card,
    ): card is Extract<OwnerProfileRelationshipCard, { status: "available" }> =>
      card.status === "available" &&
      (preferredCardId === null || card.cardId === preferredCardId),
  );
  const collecting = layer.cards.find((card) => card.status === "collecting");
  const availableOwnerCard = available
    ? profile.cards.find((card) => card.cardId === available.cardId)
    : undefined;
  const collectingOwnerCard = collecting
    ? profile.cards.find((card) => card.cardId === collecting.cardId)
    : undefined;
  return (
    <div className={styles.layerCards}>
      {available && availableOwnerCard ? (
        <AvailableQuestion
          card={availableOwnerCard}
          relationshipCard={available}
          relationshipCode={layer.relationshipCode}
          label={label}
          onShare={onShare}
          playId={playId}
          shareDisabled={shareDisabled}
        />
      ) : null}
      {collecting && collectingOwnerCard ? (
        <CollectingQuestion
          card={collectingOwnerCard}
          relationshipCard={collecting}
        />
      ) : null}
    </div>
  );
}

function RelationshipProfile({
  initialShareSelection,
  onShare,
  profile,
}: {
  initialShareSelection: ProfileShareSelection | null | undefined;
  onShare: () => void;
  profile: OwnerProfile;
}) {
  const initialShareModel = initialShareSelection
    ? buildProfileShareCardModel(profile, initialShareSelection)
    : null;
  const shareDisabled =
    initialShareSelection === null ||
    (initialShareSelection !== undefined && initialShareModel === null);
  const [selectedCode, setSelectedCode] = useState(() =>
    initialShareModel
      ? initialShareSelection!.relationshipCode
      : initialOwnerProfileRelationshipCode(profile.relationshipLayers),
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(() =>
    initialShareModel ? initialShareSelection!.cardId : null,
  );
  const fallbackCode = initialOwnerProfileRelationshipCode(
    profile.relationshipLayers,
  );
  const selectedLayer =
    profile.relationshipLayers.find(
      (layer) => layer.relationshipCode === selectedCode,
    ) ??
    profile.relationshipLayers.find(
      (layer) => layer.relationshipCode === fallbackCode,
    );

  if (!selectedLayer) return null;
  return (
    <section className={styles.relationships} aria-labelledby="layers-title">
      <div className={styles.sectionHead}>
        <h2 id="layers-title">관계별로 보는 나</h2>
        <span>관계를 골라 보세요</span>
      </div>
      <div
        className={styles.relationshipPicker}
        role="group"
        aria-label="관계 선택"
      >
        {profile.relationshipLayers.map((layer) => {
          const label = relationshipLabel(layer.relationshipCode);
          const selected =
            layer.relationshipCode === selectedLayer.relationshipCode;
          return (
            <button
              key={layer.relationshipCode}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}, ${
                layer.status === "available"
                  ? `${layer.sightCount}명, 공개 가능`
                  : `${layer.sightCount}/3, 시선을 모으는 중`
              }`}
              onClick={() => {
                setSelectedCode(layer.relationshipCode);
                setSelectedCardId(null);
              }}
            >
              <span>{label}</span>
              <strong>
                {layer.status === "available"
                  ? layer.sightCount
                  : `${layer.sightCount}/3`}
              </strong>
            </button>
          );
        })}
      </div>
      <div className={styles.selectedLayerHeading}>
        <strong>{relationshipLabel(selectedLayer.relationshipCode)}</strong>
        <span>
          {selectedLayer.status === "available"
            ? `${selectedLayer.sightCount}명 · 공개 가능`
            : `${selectedLayer.sightCount}/3 · 수집 중`}
        </span>
      </div>
      <LayerContent
        layer={selectedLayer}
        onShare={onShare}
        playId={profile.playId}
        preferredCardId={selectedCardId}
        profile={profile}
        shareDisabled={shareDisabled}
      />
      <p className={styles.privacyNote}>이름과 개별 답변은 공개되지 않아요.</p>
    </section>
  );
}

export default function OwnerProfileView({
  initialShareSelection,
  playId,
}: {
  initialShareSelection?: ProfileShareSelection | null;
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
      <main className={styles.shell}>
        <p role="status">내 시선을 불러오는 중…</p>
      </main>
    );
  }

  if (state.kind === "terminal") {
    return (
      <main className={styles.shell}>
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
      </main>
    );
  }

  if (state.kind === "auth") {
    return (
      <main className={styles.shell}>
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
      </main>
    );
  }

  const { profile, notice } = state;
  return (
    <main className={styles.shell}>
      <section className={styles.profile} aria-labelledby="profile-title">
        <nav className={styles.ownerNav} aria-label="내 질문팩 이동">
          <Link className={styles.back} href="/me">
            ← 내 질문팩
          </Link>
          <Link className={styles.back} href={`/play/${profile.playId}`}>
            내 답변
          </Link>
        </nav>
        <p className={styles.brand}>겹 · {profile.packTitle}</p>
        <h1 id="profile-title" ref={headingRef} tabIndex={-1}>
          내 시선 프로필
        </h1>
        <p className={styles.sightTotal}>시선 {profile.sightCount}개</p>

        <section className={styles.summary} aria-labelledby="sight-summary">
          <p id="sight-summary">공개 링크로 도착한 시선</p>
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

        {profile.relationshipLayers.length === 0 ? (
          <section className={styles.emptyLayers}>
            <h2>관계별로 보는 나</h2>
            <p>공개 링크로 시선이 도착하면 관계별 상태가 여기에 쌓여요.</p>
          </section>
        ) : (
          <RelationshipProfile
            initialShareSelection={initialShareSelection}
            onShare={() => {
              if (reshareClickRef.current) return;
              reshareClickRef.current = true;
              void recordOwnerProfileReshareClicked(profile.playId).catch(
                () => undefined,
              );
            }}
            profile={profile}
          />
        )}
      </section>
    </main>
  );
}
