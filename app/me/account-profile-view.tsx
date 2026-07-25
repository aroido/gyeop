"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AccountOwnerAvailableLayer,
  AccountOwnerCollectingLayer,
  AccountOwnerProfile,
  AccountOwnerSelfLayer,
} from "@/lib/owner-profile/account-profile";
import type {
  ConceptHook,
  ConceptProfile,
  ConceptSourceSummary,
} from "@/lib/owner-profile/concept-profile";
import {
  recordConceptDetailOpened,
  recordConceptProfileViewed,
} from "@/lib/owner-profile/concept-profile-client";
import { firstAccountProfileShareSelection } from "@/lib/owner-profile/profile-share-card-core.mjs";
import { recordOwnerProfileReshareClicked } from "@/lib/owner-profile/owner-profile-client";
import { relationshipLabel } from "@/lib/visitor-response/visitor-context-core.mjs";

import LogoutButton from "./logout-button";
import styles from "./owner-list.module.css";

type RelationshipChoice =
  AccountOwnerAvailableLayer | AccountOwnerCollectingLayer;
type StackLayer =
  | AccountOwnerAvailableLayer
  | AccountOwnerCollectingLayer
  | AccountOwnerSelfLayer;

function choiceKey(layer: RelationshipChoice) {
  return `${layer.playId}:${layer.relationshipCode}`;
}

function selectedOption(
  layer: Readonly<{
    selfChoice: "a" | "b";
    optionA: string;
    optionB: string;
  }>,
) {
  return layer.selfChoice === "a" ? layer.optionA : layer.optionB;
}

function RelationshipDetail({ layer }: { layer: RelationshipChoice }) {
  const label = relationshipLabel(layer.relationshipCode);
  if (layer.kind === "collecting") {
    return (
      <article className={styles.collectingDetail}>
        <p className={styles.eyebrow}>
          {layer.packTitle} · {label}
        </p>
        <h3>시선을 모으는 중 · {layer.sightCount}/3</h3>
        <p>이 팩의 시선만 더 모아 공개 기준을 확인해요.</p>
      </article>
    );
  }
  return (
    <article className={styles.relationshipDetail}>
      <p className={styles.eyebrow}>
        {layer.packTitle} · {label}
      </p>
      <h3>{layer.prompt}</h3>
      <div className={styles.selfChoice}>
        <span>내 선택</span>
        <strong>{selectedOption(layer)}</strong>
      </div>
      <dl aria-label={`${label} 시선 ${layer.sampleCount}개`}>
        <div>
          <dt>{layer.optionA}</dt>
          <dd>시선 {layer.counts.a}개</dd>
        </div>
        <div>
          <dt>{layer.optionB}</dt>
          <dd>시선 {layer.counts.b}개</dd>
        </div>
      </dl>
    </article>
  );
}

function StackCard({ layer, index }: { layer: StackLayer; index: number }) {
  const className = `${styles.stackCard} ${styles[`layer${index}`]}`;
  if (layer.kind === "collecting") {
    return (
      <article className={className}>
        <p>{layer.packTitle}</p>
        <strong>{relationshipLabel(layer.relationshipCode)}</strong>
        <span>시선을 모으는 중 · {layer.sightCount}/3</span>
      </article>
    );
  }
  return (
    <article className={className}>
      <p>
        {layer.packTitle}
        {layer.kind === "available"
          ? ` · ${relationshipLabel(layer.relationshipCode)}`
          : " · 내가 보는 나"}
      </p>
      <strong>{layer.prompt}</strong>
      <span>내 선택 · {selectedOption(layer)}</span>
    </article>
  );
}

const STAGE_TEXT = Object.freeze({
  trace: "흔적",
  outline: "윤곽",
  clear: "선명",
});

const BAND_TEXT = Object.freeze({
  trace: "넓은 범위",
  outline: "중간 범위",
  clear: "좁은 범위",
});

function ConceptSignal({
  source,
  subject,
}: {
  source: ConceptSourceSummary;
  subject: "내 위치" | "지인 익명 집계";
}) {
  if (source.status === "locked") {
    return (
      <p className={styles.conceptLocked}>
        <strong>○ {subject}</strong>
        <span>시선을 모으는 중 · {source.sightCount}/3</span>
      </p>
    );
  }
  const directional = source.direction === "a" || source.direction === "b";
  const display = directional ? "directional" : source.direction;
  const band =
    subject === "지인 익명 집계" && directional
      ? BAND_TEXT[source.stage]
      : null;
  const positionStyle = directional
    ? ({
        "--concept-position": `${((source.position + 1) / 2) * 100}%`,
      } as CSSProperties)
    : undefined;
  const status =
    source.direction === "contextual"
      ? "상황에 따라 양쪽 모습"
      : source.direction === "unsettled"
        ? "아직 한쪽으로 모이지 않음"
        : source.directionText;
  return (
    <div className={styles.conceptSignal}>
      <p>
        <strong>
          {subject === "내 위치" ? "●" : "○"} {subject}
        </strong>
        <span>
          {status}
          {band ? ` · ${band}` : ""}
        </span>
      </p>
      <div
        className={styles.conceptSignalTrack}
        data-band={
          subject === "지인 익명 집계" && directional ? source.stage : undefined
        }
        data-display={display}
        role="img"
        aria-label={`${subject}: ${status}${band ? `, ${band}` : ""}, 근거 ${STAGE_TEXT[source.stage]}`}
        style={positionStyle}
      >
        {directional ? (
          <>
            {band ? <span className={styles.conceptBand} aria-hidden /> : null}
            <span
              className={
                subject === "내 위치"
                  ? styles.conceptSelfMarker
                  : styles.conceptOthersMarker
              }
              aria-hidden
            />
          </>
        ) : (
          <span className={styles.conceptPattern} aria-hidden />
        )}
      </div>
    </div>
  );
}

function ConceptEvidence({ hook }: { hook: ConceptHook }) {
  const opened = useRef(false);
  const recordDetail = () => {
    if (opened.current) return;
    const key = `${hook.profileSourcePlayId}\0${hook.conceptId}`;
    try {
      if (sessionStorage.getItem(key) === "1") {
        opened.current = true;
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch {
      // The in-memory latch still prevents duplicate events in this mount.
    }
    opened.current = true;
    void recordConceptDetailOpened(
      hook.profileSourcePlayId,
      hook.conceptId,
    ).catch(() => undefined);
  };
  return (
    <details className={styles.conceptEvidence} onToggle={recordDetail}>
      <summary>왜 이렇게 보일까?</summary>
      {hook.profileEvidence.map(({ source, evidence }) => (
        <div key={source}>
          <strong>{source === "self" ? "내 답변" : "주변 시선"}</strong>
          <span>
            {evidence.packCount}팩 · {evidence.contextCount}맥락
          </span>
          <p>
            {evidence.packs
              .map(
                ({ packTitle, contexts }) =>
                  `${packTitle} · ${contexts.join(", ")}`,
              )
              .join(" / ")}
          </p>
        </div>
      ))}
      {hook.privateOthers.status === "locked" ? (
        <p>시선을 모으는 중 · {hook.privateOthers.sightCount}/3</p>
      ) : null}
    </details>
  );
}

export default function AccountProfileView({
  profile,
  conceptProfile,
}: {
  profile: AccountOwnerProfile;
  conceptProfile: ConceptProfile | null;
}) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shareDialogRef = useRef<HTMLDialogElement>(null);
  const exposureRecorded = useRef(false);
  const shareConfirming = useRef(false);
  const relationshipChoices = useMemo(() => {
    const choices: RelationshipChoice[] = [];
    const seen = new Set<string>();
    for (const layer of profile.availableLayers) {
      const key = choiceKey(layer);
      if (!seen.has(key)) {
        seen.add(key);
        choices.push(layer);
      }
    }
    for (const layer of profile.collectingLayers) {
      const key = choiceKey(layer);
      if (!seen.has(key)) {
        seen.add(key);
        choices.push(layer);
      }
    }
    return choices;
  }, [profile.availableLayers, profile.collectingLayers]);
  const [selectedKey, setSelectedKey] = useState(
    relationshipChoices[0] ? choiceKey(relationshipChoices[0]) : null,
  );
  const selected =
    relationshipChoices.find((layer) => choiceKey(layer) === selectedKey) ??
    relationshipChoices[0] ??
    null;
  const stackLayers: StackLayer[] = [
    ...relationshipChoices,
    ...profile.selfLayers,
  ].slice(0, 4);
  const shareSelection = firstAccountProfileShareSelection(
    profile.availableLayers,
  );
  const conceptHooks = conceptProfile?.hooks ?? [];
  const hasConceptHooks = conceptHooks.length > 0;
  const conceptShare = conceptProfile?.shareOptions[0] ?? null;
  const primaryHref = shareSelection
    ? `/me/profile/${shareSelection.playId}?share_relationship=${encodeURIComponent(
        shareSelection.relationshipCode,
      )}&share_card=${encodeURIComponent(
        shareSelection.cardId,
      )}#shareable-insight`
    : profile.ctaPlayId
      ? `/me/plays/${profile.ctaPlayId}`
      : "/";
  const [selectedShareId, setSelectedShareId] = useState(
    conceptShare?.conceptId ?? "",
  );
  const [shareError, setShareError] = useState("");
  const [sharePending, setSharePending] = useState(false);
  const selectedConceptShare =
    conceptProfile?.shareOptions.find(
      ({ conceptId }) => conceptId === selectedShareId,
    ) ??
    conceptShare ??
    null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const source = conceptProfile?.hooks[0]?.profileSourcePlayId;
    if (!source || exposureRecorded.current) return;
    exposureRecorded.current = true;
    void recordConceptProfileViewed(source).catch(() => undefined);
  }, [conceptProfile]);

  const openSharePicker = () => {
    setShareError("");
    shareDialogRef.current?.showModal();
  };

  const confirmConceptShare = async () => {
    if (!selectedConceptShare || shareConfirming.current) return;
    shareConfirming.current = true;
    setSharePending(true);
    setShareError("");
    try {
      await recordOwnerProfileReshareClicked(selectedConceptShare.sourcePlayId);
      router.push(
        `/me/plays/${selectedConceptShare.sourcePlayId}?entry_source=profile_reshare&share_concept=${encodeURIComponent(
          selectedConceptShare.conceptId,
        )}`,
      );
    } catch {
      shareConfirming.current = false;
      setSharePending(false);
      setShareError(
        "공유 준비를 기록하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
  };

  return (
    <main className={styles.shell}>
      <section className={styles.profile} aria-labelledby="account-title">
        <header className={styles.profileHeader}>
          <h1 id="account-title" ref={headingRef} tabIndex={-1}>
            {profile.nickname}의 겹
          </h1>
          {!hasConceptHooks ? (
            <p className={styles.profileLead}>
              {shareSelection
                ? "친구가 본 내 모습을 한 장으로 나눠보세요."
                : profile.ctaPlayId
                  ? "친구의 답이 더 모이면 내 겹을 공유할 수 있어요."
                  : "질문팩에 답하고, 내가 보는 나부터 쌓아보세요."}
            </p>
          ) : null}
          {!hasConceptHooks ? (
            <Link className={styles.primary} href={primaryHref!}>
              {shareSelection
                ? "내 겹 공유하기"
                : profile.ctaPlayId
                  ? "시선 더 모으기"
                  : "질문팩 시작하기"}
            </Link>
          ) : null}
          <div className={styles.metrics} aria-label="계정 프로필 요약">
            <p>시선 {profile.sightCount}</p>
            <p>완료한 겹 {profile.completedPlayCount}</p>
            <p>관계 {profile.relationshipCount}</p>
          </div>
        </header>

        {hasConceptHooks ? (
          <section
            className={styles.concepts}
            aria-labelledby="concept-profile-title"
          >
            <div className={styles.conceptHeading}>
              <p className={styles.eyebrow}>누적 질문 신호</p>
              <h2 id="concept-profile-title">친구가 본 나</h2>
            </div>
            <div className={styles.conceptList}>
              {conceptHooks.map((hook) => (
                <article
                  className={styles.conceptCard}
                  data-concept-card=""
                  data-stage={hook.stage}
                  key={hook.conceptId}
                >
                  <p>{hook.areaLabel}</p>
                  <h3>{hook.conceptLabel}</h3>
                  <div className={styles.conceptEndpoints}>
                    <span>{hook.directionA}</span>
                    <span>{hook.directionB}</span>
                  </div>
                  <ConceptSignal source={hook.self} subject="내 위치" />
                  <ConceptSignal
                    source={hook.privateOthers}
                    subject="지인 익명 집계"
                  />
                  <div className={styles.conceptCardMeta}>
                    <span>고유 문항 {hook.self.evidence.cardCount}개</span>
                    <strong>근거 {STAGE_TEXT[hook.stage]}</strong>
                  </div>
                  <ConceptEvidence hook={hook} />
                </article>
              ))}
            </div>
            <section
              className={styles.areaRail}
              aria-labelledby="concept-area-title"
            >
              <h3 id="concept-area-title">8개 영역의 쌓임</h3>
              <ul>
                {conceptProfile!.areaSummaries.map((area) => (
                  <li data-stage={area.stage} key={area.areaId}>
                    <strong>{area.areaLabel}</strong>
                    <span>문항 {area.cardCount}</span>
                    <small>{STAGE_TEXT[area.stage]}</small>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        ) : null}

        {hasConceptHooks && conceptShare ? (
          <section
            className={styles.conceptShareAction}
            aria-labelledby="concept-share-title"
          >
            <h2 id="concept-share-title">세 가지 겹을 한 장에 담아요</h2>
            <p>공유 가능한 익명 시선만 골라 보여드려요.</p>
            <button
              className={styles.primary}
              type="button"
              onClick={() => openSharePicker()}
            >
              내 겹 공유하기
            </button>
          </section>
        ) : hasConceptHooks ? (
          <section
            className={styles.conceptShareAction}
            aria-labelledby="concept-collect-title"
          >
            <h2 id="concept-collect-title">
              친구의 시선이 모이면 나눌 수 있어요
            </h2>
            <p>
              지금 보이는 결을 먼저 살펴보고, 같은 팩의 시선을 더 모아보세요.
            </p>
            <Link
              className={styles.primary}
              href={profile.ctaPlayId ? `/me/plays/${profile.ctaPlayId}` : "/"}
            >
              {profile.ctaPlayId ? "시선 더 모으기" : "질문팩 시작하기"}
            </Link>
          </section>
        ) : null}

        {!hasConceptHooks && stackLayers.length > 0 ? (
          <div
            className={styles.stack}
            data-layer-count={stackLayers.length}
            aria-hidden="true"
          >
            {stackLayers.map((layer, index) => (
              <StackCard
                key={`${layer.kind}:${layer.playId}:${
                  "cardId" in layer ? layer.cardId : layer.relationshipCode
                }`}
                layer={layer}
                index={index}
              />
            ))}
          </div>
        ) : null}

        {!hasConceptHooks && relationshipChoices.length > 0 ? (
          <section
            className={styles.relationships}
            aria-labelledby="relationship-title"
          >
            <h2 id="relationship-title">관계별로 보는 나</h2>
            <div
              className={styles.relationshipPicker}
              role="group"
              aria-label="관계 선택"
            >
              {relationshipChoices.map((layer) => {
                const key = choiceKey(layer);
                const label = relationshipLabel(layer.relationshipCode);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={key === choiceKey(selected!)}
                    onClick={() => setSelectedKey(key)}
                  >
                    <span>{layer.packTitle}</span>
                    <strong>{label}</strong>
                    <small>
                      {layer.kind === "collecting"
                        ? `${layer.sightCount}/3`
                        : `시선 ${layer.sampleCount}개`}
                    </small>
                  </button>
                );
              })}
            </div>
            {selected ? <RelationshipDetail layer={selected} /> : null}
          </section>
        ) : !hasConceptHooks && profile.selfLayers[0] ? (
          <article className={styles.seedDetail}>
            <p className={styles.eyebrow}>
              {profile.selfLayers[0].packTitle} · 내가 보는 나
            </p>
            <h2>{profile.selfLayers[0].prompt}</h2>
            <p>내 선택 · {selectedOption(profile.selfLayers[0])}</p>
          </article>
        ) : null}

        <section className={styles.management} aria-labelledby="manage-title">
          <h2 id="manage-title">내 질문팩 관리</h2>
          {profile.plays.length === 0 ? (
            <p>저장한 질문팩이 아직 없어요.</p>
          ) : (
            <ul className={styles.plays}>
              {profile.plays.map((play) => (
                <li key={play.id}>
                  <div>
                    <p>{play.status === "completed" ? "완료" : "답변 중"}</p>
                    <h3>{play.packTitle}</h3>
                    <span>{play.answeredCount}/10 저장</span>
                  </div>
                  <Link
                    href={
                      play.status === "completed"
                        ? `/me/plays/${play.id}`
                        : `/play/${play.id}`
                    }
                  >
                    {play.status === "completed"
                      ? "공유·상세 관리"
                      : "이어서 답하기"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link className={styles.secondary} href="/">
          다른 질문팩 고르기
        </Link>
        <LogoutButton />
      </section>
      {conceptShare ? (
        <dialog className={styles.sharePicker} ref={shareDialogRef}>
          <form method="dialog">
            <button className={styles.dialogClose} value="cancel">
              닫기
            </button>
          </form>
          <p className={styles.eyebrow}>공유할 결 고르기</p>
          <h2>어떤 이야기로 이어갈까요?</h2>
          <div role="radiogroup" aria-label="공유할 결">
            {conceptProfile!.shareOptions.map((option, index) => {
              const axis = option.bundle[0];
              return (
                <button
                  key={option.conceptId}
                  type="button"
                  role="radio"
                  aria-checked={
                    option.conceptId === selectedConceptShare?.conceptId
                  }
                  onClick={() => setSelectedShareId(option.conceptId)}
                >
                  <strong>
                    {index === 0 ? "추천 · " : ""}
                    {axis.areaLabel} · {axis.directionA}—{axis.directionB}
                  </strong>
                </button>
              );
            })}
          </div>
          {selectedConceptShare ? (
            <button
              className={styles.primary}
              type="button"
              disabled={sharePending}
              onClick={confirmConceptShare}
            >
              {sharePending
                ? "공유 카드 준비 중…"
                : "이 내용으로 공유 카드 확인"}
            </button>
          ) : null}
          <p className={styles.shareError} role="status" aria-live="polite">
            {shareError}
          </p>
        </dialog>
      ) : null}
    </main>
  );
}
