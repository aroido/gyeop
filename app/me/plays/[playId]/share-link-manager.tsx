"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { loadOwnerFlow } from "@/lib/owner-flow/owner-flow-client";
import {
  createShareLink,
  disableShareLink,
  listShareLinks,
  rotateShareLink,
  type ShareLink,
  ShareLinkHttpError,
} from "@/lib/share-links/share-link-client";
import type { ShareKind } from "@/lib/packs/presentation";

import styles from "./share-links.module.css";

type State =
  | { kind: "loading" }
  | { kind: "terminal" }
  | { kind: "ready"; packTitle: string; links: readonly ShareLink[] };

async function readManagerState(playId: string): Promise<State> {
  const { play, pack } = await loadOwnerFlow(playId);
  if (
    play.status !== "completed" ||
    play.packSlug !== "old-friend" ||
    pack.slug !== "old-friend" ||
    pack.version !== play.packVersion
  ) {
    throw new Error("terminal");
  }
  const links = await listShareLinks(playId);
  return { kind: "ready", packTitle: pack.title, links };
}

function replaceLink(links: readonly ShareLink[], next: ShareLink) {
  return links.map((link) => (link.id === next.id ? next : link));
}

export default function ShareLinkManager({
  playId,
  defaultShareKind,
}: {
  playId: string | null;
  defaultShareKind: ShareKind;
}) {
  const [state, setState] = useState<State>(
    playId ? { kind: "loading" } : { kind: "terminal" },
  );
  const [selectedKind, setSelectedKind] = useState<ShareKind>(defaultShareKind);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function load() {
    if (!playId) return;
    setState({ kind: "loading" });
    setInviteUrl(null);
    setError(null);
    try {
      setState(await readManagerState(playId));
    } catch {
      setState({ kind: "terminal" });
    }
  }

  useEffect(() => {
    if (!playId) return;
    let active = true;
    void readManagerState(playId)
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState({ kind: "terminal" });
      });
    return () => {
      active = false;
    };
  }, [playId]);

  useEffect(() => {
    if (state.kind !== "loading") headingRef.current?.focus();
  }, [state.kind]);

  async function create() {
    if (!playId || state.kind !== "ready" || busy) return;
    setBusy("create");
    setError(null);
    try {
      const result = await createShareLink(playId, selectedKind);
      setInviteUrl(result.inviteUrl);
      setState({ ...state, links: [result.link, ...state.links] });
    } catch {
      setInviteUrl(null);
      setError("링크를 만들지 못했어요. 목록을 다시 확인해 주세요.");
      void load();
    } finally {
      setBusy(null);
    }
  }

  async function disable(link: ShareLink) {
    if (state.kind !== "ready" || busy) return;
    if (
      !window.confirm(
        "이 링크를 비활성화할까요? 더 이상 초대에 사용할 수 없어요.",
      )
    )
      return;
    setBusy(link.id);
    setError(null);
    try {
      const next = await disableShareLink(link.id);
      setInviteUrl(null);
      setState({ ...state, links: replaceLink(state.links, next) });
    } catch {
      setError("링크 상태를 바꾸지 못했어요. 다시 확인해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function rotate(link: ShareLink) {
    if (state.kind !== "ready" || busy) return;
    if (
      !window.confirm(
        "새로 발급하면 지금 링크는 바로 비활성화돼요. 계속할까요?",
      )
    )
      return;
    setBusy(link.id);
    setError(null);
    try {
      const result = await rotateShareLink(link.id);
      setInviteUrl(result.inviteUrl);
      setState({
        ...state,
        links: [
          result.link,
          ...replaceLink(state.links, { ...link, status: "disabled" }),
        ],
      });
    } catch (caught) {
      setInviteUrl(null);
      setError(
        caught instanceof ShareLinkHttpError &&
          caught.code === "SHARE_LINK_NOT_ACTIVE"
          ? "링크 상태가 바뀌었어요. 목록을 다시 불러왔습니다."
          : "새 링크를 발급하지 못했어요. 목록을 다시 확인해 주세요.",
      );
      void load();
    } finally {
      setBusy(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <main className={styles.shell}>
        <p role="status">공유 링크를 불러오는 중…</p>
      </main>
    );
  }
  if (state.kind === "terminal") {
    return (
      <main className={styles.shell}>
        <section className={styles.panel}>
          <p className={styles.brand}>겹 · 오래된 친구팩</p>
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

        <fieldset className={styles.kinds}>
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
                {kind === defaultShareKind ? <em>추천</em> : null}
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

        {inviteUrl ? (
          <aside className={styles.ready} aria-live="polite">
            <strong>공유 링크가 준비됐어요</strong>
            <p>이 전체 링크는 현재 화면에서만 사용할 수 있어요.</p>
            <code>{inviteUrl}</code>
          </aside>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
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
      </section>
    </main>
  );
}
