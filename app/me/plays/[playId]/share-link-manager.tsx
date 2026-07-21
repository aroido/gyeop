"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  loadOwnerFlow,
  OwnerFlowHttpError,
} from "@/lib/owner-flow/owner-flow-client";
import { defaultShareKind, type ShareKind } from "@/lib/packs/presentation";
import {
  buildShareData,
  isShareCancellation,
} from "@/lib/share-links/share-handoff-core.mjs";
import {
  createShareLink,
  disableShareLink,
  listShareLinks,
  recordShareAction,
  rotateShareLink,
  type ShareEntrySource,
  type ShareLink,
  ShareLinkHttpError,
} from "@/lib/share-links/share-link-client";

import styles from "./share-links.module.css";
import PrivateOneToOnePanel from "./private-one-to-one-panel";

type State =
  | { kind: "loading" }
  | { kind: "auth" }
  | { kind: "terminal" }
  | {
      kind: "ready";
      packTitle: string;
      defaultShareKind: ShareKind;
      links: readonly ShareLink[];
    };
type ReadyLink = Readonly<{
  linkId: string;
  kind: "public" | "one_to_one";
  inviteUrl: string;
}>;
type Feedback = Readonly<{
  tone: "status" | "alert";
  message: string;
}>;

function isAuthenticationRequired(error: unknown) {
  return (
    (error instanceof OwnerFlowHttpError ||
      error instanceof ShareLinkHttpError) &&
    error.status === 401
  );
}

async function readManagerState(
  playId: string,
): Promise<Extract<State, { kind: "ready" }>> {
  const { play, pack } = await loadOwnerFlow(playId);
  if (
    play.status !== "completed" ||
    pack.slug !== play.packSlug ||
    pack.version !== play.packVersion
  ) {
    throw new Error("terminal");
  }
  const links = await listShareLinks(playId);
  return {
    kind: "ready",
    packTitle: pack.title,
    defaultShareKind: defaultShareKind(pack.sensitivity),
    links,
  };
}

function replaceLink(links: readonly ShareLink[], next: ShareLink) {
  return links.map((link) => (link.id === next.id ? next : link));
}

function subscribeShareSupport() {
  return () => undefined;
}

function readShareSupport() {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export default function ShareLinkManager({
  playId,
  entrySource,
}: {
  playId: string | null;
  entrySource: ShareEntrySource;
}) {
  const [state, setState] = useState<State>(
    playId ? { kind: "loading" } : { kind: "terminal" },
  );
  const [selectedKind, setSelectedKind] = useState<ShareKind>("public");
  const [readyLink, setReadyLink] = useState<ReadyLink | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const canShare = useSyncExternalStore(
    subscribeShareSupport,
    readShareSupport,
    () => false,
  );
  const actionLatchRef = useRef(false);
  const focusAfterActionRef = useRef<"share" | "copy" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const readyHeadingRef = useRef<HTMLHeadingElement>(null);
  const manualUrlRef = useRef<HTMLInputElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  function beginAction(action: string) {
    if (actionLatchRef.current) return false;
    actionLatchRef.current = true;
    setBusy(action);
    return true;
  }

  function endAction() {
    actionLatchRef.current = false;
    setBusy(null);
  }

  async function load() {
    if (!playId) return;
    setState({ kind: "loading" });
    setReadyLink(null);
    try {
      const next = await readManagerState(playId);
      setSelectedKind(next.defaultShareKind);
      setState(next);
    } catch (error) {
      setState({ kind: isAuthenticationRequired(error) ? "auth" : "terminal" });
    }
  }

  useEffect(() => {
    if (!playId) return;
    let active = true;
    void readManagerState(playId)
      .then((next) => {
        if (active) {
          setSelectedKind(next.defaultShareKind);
          setState(next);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            kind: isAuthenticationRequired(error) ? "auth" : "terminal",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [playId]);

  useEffect(() => {
    if (state.kind !== "loading") headingRef.current?.focus();
  }, [state.kind]);

  useEffect(() => {
    if (readyLink) readyHeadingRef.current?.focus();
  }, [readyLink]);

  useEffect(() => {
    if (busy !== null || focusAfterActionRef.current === null) return;
    const target = focusAfterActionRef.current;
    focusAfterActionRef.current = null;
    if (target === "share") shareButtonRef.current?.focus();
    if (target === "copy") copyButtonRef.current?.focus();
  }, [busy, feedback]);

  async function create() {
    if (!playId || state.kind !== "ready" || !beginAction("create")) return;
    setFeedback(null);
    try {
      const result = await createShareLink(playId, selectedKind);
      setReadyLink({
        linkId: result.link.id,
        kind: result.link.kind,
        inviteUrl: result.inviteUrl,
      });
      setState((current) =>
        current.kind === "ready"
          ? { ...current, links: [result.link, ...current.links] }
          : current,
      );
    } catch {
      setFeedback({
        tone: "alert",
        message: "링크를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      });
    } finally {
      endAction();
    }
  }

  async function disable(link: ShareLink) {
    if (!playId || state.kind !== "ready" || actionLatchRef.current) return;
    if (
      !window.confirm(
        "이 링크를 비활성화할까요? 더 이상 초대에 사용할 수 없어요.",
      ) ||
      !beginAction(link.id)
    )
      return;
    setFeedback(null);
    try {
      const next = await disableShareLink(playId, link.id);
      setReadyLink((current) => (current?.linkId === link.id ? null : current));
      setState((current) =>
        current.kind === "ready"
          ? { ...current, links: replaceLink(current.links, next) }
          : current,
      );
    } catch {
      setFeedback({
        tone: "alert",
        message: "링크 상태를 바꾸지 못했어요. 다시 확인해 주세요.",
      });
    } finally {
      endAction();
    }
  }

  async function rotate(link: ShareLink) {
    if (!playId || state.kind !== "ready" || actionLatchRef.current) return;
    if (
      !window.confirm(
        "새로 발급하면 지금 링크는 바로 비활성화돼요. 계속할까요?",
      ) ||
      !beginAction(link.id)
    )
      return;
    setFeedback(null);
    try {
      const result = await rotateShareLink(playId, link.id);
      setReadyLink({
        linkId: result.link.id,
        kind: result.link.kind,
        inviteUrl: result.inviteUrl,
      });
      setState((current) =>
        current.kind === "ready"
          ? {
              ...current,
              links: [
                result.link,
                ...replaceLink(current.links, {
                  ...link,
                  status: "disabled",
                }),
              ],
            }
          : current,
      );
    } catch (caught) {
      const drifted =
        caught instanceof ShareLinkHttpError &&
        caught.code === "SHARE_LINK_NOT_ACTIVE";
      setFeedback({
        tone: "alert",
        message: drifted
          ? "링크 상태가 바뀌었어요. 목록을 다시 불러왔습니다."
          : "새 링크를 발급하지 못했어요. 기존 링크는 그대로 있어요.",
      });
      if (drifted) void load();
    } finally {
      endAction();
    }
  }

  async function shareReadyLink() {
    if (
      !playId ||
      !readyLink ||
      state.kind !== "ready" ||
      !canShare ||
      !beginAction("share")
    )
      return;
    setFeedback(null);
    try {
      await navigator.share(
        buildShareData(readyLink.inviteUrl, state.packTitle),
      );
      setFeedback({
        tone: "status",
        message: "공유 메뉴로 링크를 전달했어요.",
      });
      void recordShareAction(
        playId,
        readyLink.linkId,
        "share_handoff_succeeded",
        entrySource,
      ).catch(() => undefined);
    } catch (caught) {
      setFeedback(
        isShareCancellation(caught)
          ? {
              tone: "status",
              message: "공유를 취소했어요. 링크는 그대로 있어요.",
            }
          : {
              tone: "alert",
              message: "공유 메뉴를 열지 못했어요. 링크 복사를 사용해 주세요.",
            },
      );
    } finally {
      focusAfterActionRef.current = "share";
      endAction();
    }
  }

  async function copyReadyLink() {
    if (!playId || !readyLink || !beginAction("copy")) return;
    setFeedback(null);
    let manualFallback = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(readyLink.inviteUrl);
      setFeedback({
        tone: "status",
        message:
          "링크를 복사했어요. 카카오톡이나 인스타그램 DM, 문자에 붙여넣어 보내세요.",
      });
      void recordShareAction(
        playId,
        readyLink.linkId,
        "share_link_copied",
        entrySource,
      ).catch(() => undefined);
    } catch {
      manualFallback = true;
      setFeedback({
        tone: "alert",
        message:
          "자동 복사가 안 됐어요. 아래 링크를 길게 눌러 직접 복사해 주세요.",
      });
      manualUrlRef.current?.focus();
      manualUrlRef.current?.select();
    } finally {
      if (!manualFallback) {
        focusAfterActionRef.current = "copy";
      }
      endAction();
    }
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.shell}>
        <p role="status">공유 링크를 불러오는 중…</p>
      </main>
    );
  }
  if (state.kind === "auth") {
    return (
      <main className={styles.shell}>
        <section className={styles.panel}>
          <p className={styles.brand}>겹 · 질문팩</p>
          <h1 ref={headingRef} tabIndex={-1}>
            다시 로그인해 주세요
          </h1>
          <p>계정을 확인하면 저장해 둔 팩과 공유 링크를 다시 볼 수 있어요.</p>
          <Link
            className={styles.primaryLink}
            href="/auth/sign-in?returnTo=%2Fme"
          >
            Google로 로그인
          </Link>
        </section>
      </main>
    );
  }
  if (state.kind === "terminal") {
    return (
      <main className={styles.shell}>
        <section className={styles.panel}>
          <p className={styles.brand}>겹 · 질문팩</p>
          <h1 ref={headingRef} tabIndex={-1}>
            이 팩을 이어갈 수 없어요
          </h1>
          <p>진행 정보가 만료됐거나 이 브라우저에서 열 수 없는 팩이에요.</p>
          <Link className={styles.primaryLink} href="/">
            홈으로
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="share-title">
        <Link className={styles.back} href={`/play/${playId}`}>
          ← 내 답변
        </Link>
        <p className={styles.brand}>겹 · {state.packTitle}</p>
        <h1 id="share-title" ref={headingRef} tabIndex={-1}>
          공유 링크
        </h1>
        <p className={styles.lead}>
          친구가 나를 어떻게 보는지 답할 수 있는 초대를 준비해요.
        </p>
        <Link className={styles.profileEntry} href={`/me/profile/${playId}`}>
          내 시선 프로필 →
        </Link>

        <fieldset className={styles.kinds} disabled={busy !== null}>
          <legend>누구에게 보낼까요?</legend>
          {(
            [
              [
                "public",
                "여러 친구에게 공개",
                "여러 명이 같은 링크로 참여할 수 있어요.",
              ],
              [
                "one_to_one",
                "한 친구에게 1:1",
                "한 명이 완료하면 닫히는 링크예요.",
              ],
            ] as const
          ).map(([kind, title, copy]) => (
            <label
              key={kind}
              className={styles.kind}
              data-selected={selectedKind === kind}
            >
              <input
                type="radio"
                name="share-kind"
                value={kind}
                checked={selectedKind === kind}
                onChange={() => setSelectedKind(kind)}
              />
              <span>
                <strong>{title}</strong>
                {kind === state.defaultShareKind ? <em>추천</em> : null}
                <small>{copy}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          className={styles.primary}
          type="button"
          disabled={busy !== null}
          onClick={create}
        >
          {busy === "create" ? "만드는 중…" : "공유 링크 만들기"}
        </button>

        {readyLink ? (
          <aside className={styles.ready} aria-labelledby="ready-link-title">
            <h2 id="ready-link-title" ref={readyHeadingRef} tabIndex={-1}>
              공유 링크가 준비됐어요
            </h2>
            <p>
              내가 먼저 답한 질문이에요. 친구에게 보내고 서로의 답을 확인해
              보세요.
            </p>
            <div className={styles.handoffActions}>
              {canShare ? (
                <button
                  ref={shareButtonRef}
                  className={styles.primary}
                  disabled={busy !== null}
                  type="button"
                  onClick={shareReadyLink}
                >
                  {busy === "share"
                    ? "공유 메뉴 여는 중…"
                    : "친구에게 공유하기"}
                </button>
              ) : null}
              <button
                ref={copyButtonRef}
                className={canShare ? styles.secondary : styles.primary}
                disabled={busy !== null}
                type="button"
                onClick={copyReadyLink}
              >
                {busy === "copy" ? "복사하는 중…" : "링크 복사"}
              </button>
            </div>
            {feedback ? (
              <p
                className={
                  feedback.tone === "alert" ? styles.error : styles.feedback
                }
                role={feedback.tone}
                aria-live={feedback.tone === "status" ? "polite" : undefined}
              >
                {feedback.message}
              </p>
            ) : null}
            <label className={styles.manualLabel} htmlFor="manual-share-url">
              공유 링크 직접 복사
            </label>
            <input
              id="manual-share-url"
              ref={manualUrlRef}
              className={styles.manualUrl}
              readOnly
              value={readyLink.inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <small>전체 링크는 현재 화면에서만 사용할 수 있어요.</small>
          </aside>
        ) : feedback ? (
          <p
            className={
              feedback.tone === "alert" ? styles.error : styles.feedback
            }
            role={feedback.tone}
            aria-live={feedback.tone === "status" ? "polite" : undefined}
          >
            {feedback.message}
          </p>
        ) : null}

        <section className={styles.list} aria-labelledby="link-list-title">
          <h2 id="link-list-title">만든 링크</h2>
          {state.links.length === 0 ? (
            <p className={styles.empty}>아직 만든 링크가 없어요.</p>
          ) : (
            <ul>
              {state.links.map((link) => (
                <li key={link.id}>
                  <div>
                    <strong>
                      {link.kind === "public" ? "여러 친구" : "1:1 친구"}
                    </strong>
                    <span>
                      {link.status === "active"
                        ? "사용 중"
                        : link.status === "disabled"
                          ? "비활성"
                          : "만료"}
                    </span>
                  </div>
                  {link.expiresAt ? (
                    <small>
                      만료{" "}
                      {new Date(link.expiresAt).toLocaleDateString("ko-KR")}
                    </small>
                  ) : (
                    <small>자동 만료 없음</small>
                  )}
                  {link.status === "active" && readyLink?.linkId !== link.id ? (
                    <p className={styles.reissueGuide}>
                      전체 링크가 사라졌어요. 공유하려면 새로 발급해 주세요.
                    </p>
                  ) : null}
                  {link.status === "active" ? (
                    <div className={styles.actions}>
                      <button
                        disabled={busy !== null}
                        type="button"
                        onClick={() => rotate(link)}
                      >
                        새로 발급
                      </button>
                      <button
                        disabled={busy !== null}
                        type="button"
                        onClick={() => disable(link)}
                      >
                        비활성화
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        {playId ? <PrivateOneToOnePanel playId={playId} /> : null}
      </section>
    </main>
  );
}
