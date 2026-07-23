"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  AccountOwnerAvailableLayer,
  AccountOwnerCollectingLayer,
  AccountOwnerProfile,
  AccountOwnerSelfLayer,
} from "@/lib/owner-profile/account-profile";
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

export default function AccountProfileView({
  profile,
}: {
  profile: AccountOwnerProfile;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.profile} aria-labelledby="account-title">
        <header className={styles.profileHeader}>
          <h1 id="account-title" ref={headingRef} tabIndex={-1}>
            {profile.nickname}의 겹
          </h1>
          <p className={styles.profileLead}>
            {profile.ctaPlayId
              ? "관계마다 다른 나를 모아보세요."
              : "질문팩에 답하고, 내가 보는 나부터 쌓아보세요."}
          </p>
          <Link
            className={styles.primary}
            href={profile.ctaPlayId ? `/me/plays/${profile.ctaPlayId}` : "/"}
          >
            {profile.ctaPlayId ? "질문팩 공유하기" : "질문팩 시작하기"}
          </Link>
          <div className={styles.metrics} aria-label="계정 프로필 요약">
            <p>시선 {profile.sightCount}</p>
            <p>완료한 겹 {profile.completedPlayCount}</p>
            <p>관계 {profile.relationshipCount}</p>
          </div>
        </header>

        {stackLayers.length > 0 ? (
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

        {relationshipChoices.length > 0 ? (
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
        ) : profile.selfLayers[0] ? (
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
    </main>
  );
}
