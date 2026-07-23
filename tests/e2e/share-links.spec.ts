import { expect, test, type Page, type Route } from "@playwright/test";

import manifest from "../../content/packs/old-friend-v2.json" with { type: "json" };

import { installOwnerFlowApi, playId } from "./owner-flow-fixture";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const publicIds = [
  "AAAAAAAAAAAAAAAAAAAAAA",
  "AQEBAQEBAQEBAQEBAQEBAQ",
  "AgICAgICAgICAgICAgICAg",
];
const linkIds = [
  "19100000-0000-4000-8000-000000000001",
  "19100000-0000-4000-8000-000000000002",
  "19100000-0000-4000-8000-000000000003",
];
const cardIds = [
  "conflict",
  "reunion",
  "plans",
  "comfort",
  "gathering",
  "reconnect",
  "memory",
  "travel",
  "celebration",
  "hard-day",
];

type LinkState = {
  id: string;
  publicId: string;
  kind: "public" | "one_to_one";
  status: "active" | "disabled";
  expiresAt: null;
  consumedAt: null;
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

function noContent(route: Route) {
  return route.fulfill({
    status: 204,
    headers: { "cache-control": "private, no-store" },
    body: "",
  });
}

async function installShareApi(
  page: Page,
  options: { shareEventStatus?: 204 | 500; inviteFailures?: number } = {},
) {
  const links: LinkState[] = [];
  const calls: { method: string; pathname: string; body?: unknown }[] = [];
  let inviteFailures = options.inviteFailures ?? 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (
      !url.pathname.includes("/links") &&
      !url.pathname.includes("/share-events") &&
      !url.pathname.includes("/invites/")
    ) {
      return route.fallback();
    }
    calls.push({ method, pathname: url.pathname, body });
    if (method === "GET" && url.pathname === `/api/me/plays/${playId}/links`) {
      return json(route, 200, { links });
    }
    if (
      method === "POST" &&
      url.pathname === `/api/me/plays/${playId}/share-events`
    ) {
      return options.shareEventStatus === 500
        ? json(route, 500, {
            code: "INTERNAL_ERROR",
            message: "요청을 처리하지 못했습니다.",
          })
        : noContent(route);
    }
    if (method === "POST" && url.pathname === `/api/plays/${playId}/links`) {
      const kind = (body as { kind: "public" | "one_to_one" }).kind;
      const index = links.length;
      const link: LinkState = {
        id: linkIds[index],
        publicId: publicIds[index],
        kind,
        status: "active",
        expiresAt: null,
        consumedAt: null,
      };
      links.unshift(link);
      return json(route, 201, {
        link,
        inviteUrl: `http://127.0.0.1:3000/i/${link.publicId}#k=${secret}`,
      });
    }
    const rotate = url.pathname.match(
      /^\/api\/links\/([0-9a-f-]{36})\/rotate$/,
    );
    if (method === "POST" && rotate) {
      const old = links.find((link) => link.id === rotate[1]);
      if (!old || old.status !== "active") {
        return json(route, 409, {
          code: "SHARE_LINK_NOT_ACTIVE",
          message: "링크 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.",
        });
      }
      old.status = "disabled";
      const index = links.length;
      const link: LinkState = {
        ...old,
        id: linkIds[index],
        publicId: publicIds[index],
        status: "active",
      };
      links.unshift(link);
      return json(route, 201, {
        link,
        inviteUrl: `http://127.0.0.1:3000/i/${link.publicId}#k=${secret}`,
      });
    }
    const disable = url.pathname.match(/^\/api\/links\/([0-9a-f-]{36})$/);
    if (method === "PATCH" && disable) {
      const link = links.find((candidate) => candidate.id === disable[1]);
      if (!link)
        return json(route, 404, {
          code: "OWNER_PLAY_NOT_FOUND",
          message: "진행 중인 팩을 찾을 수 없습니다.",
        });
      link.status = "disabled";
      return json(route, 200, { link });
    }
    if (
      method === "POST" &&
      url.pathname.startsWith("/api/invites/") &&
      url.pathname.endsWith("/responses")
    ) {
      return noContent(route);
    }
    if (method === "POST" && url.pathname.startsWith("/api/invites/")) {
      if (inviteFailures > 0) {
        inviteFailures -= 1;
        return json(route, 500, {
          code: "INTERNAL_ERROR",
          message: "요청을 처리하지 못했습니다.",
        });
      }
      return json(route, 200, {
        packSlug: "old-friend",
        packVersion: "old-friend-v2",
        packTitle: "우리는 아직도 통하는 편",
        kind: "public",
      });
    }
    return route.fallback();
  });
  return {
    links,
    calls,
    failNextInvite(count = 1) {
      inviteFailures = count;
    },
  };
}

async function installBrowserHandoff(
  page: Page,
  options: {
    share: "unsupported" | "resolve" | "cancel" | "fail" | "pending";
    clipboard: "resolve" | "fail" | "pending";
    fileShare?: boolean;
  },
) {
  await page.addInitScript((initial) => {
    type HandoffState = {
      shareMode: typeof initial.share;
      clipboardMode: typeof initial.clipboard;
      shareCalls: ShareData[];
      copyCalls: string[];
      resolveShare?: () => void;
      resolveCopy?: () => void;
    };
    const state: HandoffState = {
      shareMode: initial.share,
      clipboardMode: initial.clipboard,
      shareCalls: [],
      copyCalls: [],
    };
    (
      window as typeof window & { __gyeopHandoff: HandoffState }
    ).__gyeopHandoff = state;
    if (initial.share !== "unsupported") {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          state.shareCalls.push(data);
          if (state.shareMode === "cancel") {
            throw new DOMException("cancelled", "AbortError");
          }
          if (state.shareMode === "fail") {
            throw new DOMException("failed", "NotAllowedError");
          }
          if (state.shareMode === "pending") {
            await new Promise<void>((resolve) => {
              state.resolveShare = resolve;
            });
          }
        },
      });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: (data: ShareData) =>
          initial.fileShare !== false &&
          Array.isArray(data.files) &&
          data.files.length === 1,
      });
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          state.copyCalls.push(value);
          if (state.clipboardMode === "fail") {
            throw new DOMException("failed", "NotAllowedError");
          }
          if (state.clipboardMode === "pending") {
            await new Promise<void>((resolve) => {
              state.resolveCopy = resolve;
            });
          }
        },
      },
    });
  }, options);
}

async function completedOwner(page: Page) {
  const owner = await installOwnerFlowApi(page);
  owner.state.status = "completed";
  owner.state.answers = cardIds.map((cardId) => ({ cardId, choice: "a" }));
  owner.state.currentPosition = 10;
  return owner;
}

async function installInsightProfileApi(
  page: Page,
  relationshipCode = "old_friend",
  overrides: {
    ownerPrompt?: string;
    optionA?: string;
    optionB?: string;
    counts?: { a: number; b: number };
  } = {},
) {
  const counts = overrides.counts ?? { a: 2, b: 1 };
  const sampleCount = counts.a + counts.b;
  const cards = manifest.cards.map((card, index) => ({
    cardId: card.id,
    position: card.position,
    ownerPrompt:
      index === 0 && overrides.ownerPrompt
        ? overrides.ownerPrompt
        : card.ownerPrompt,
    optionA:
      index === 0 && overrides.optionA ? overrides.optionA : card.optionA,
    optionB:
      index === 0 && overrides.optionB ? overrides.optionB : card.optionB,
    selfChoice: index === 0 ? ("a" as const) : ("b" as const),
    sampleCount: index === 0 ? sampleCount : 0,
    counts: index === 0 ? counts : null,
  }));
  await page.route("**/api/me/profile**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/me/profile") return route.fallback();
    return json(route, 200, {
      playId,
      packSlug: manifest.slug,
      packVersion: manifest.version,
      packTitle: manifest.title,
      sightCount: sampleCount,
      sightStatus: "has_sight",
      cards,
      relationshipLayers: [
        {
          relationshipCode,
          sightCount: sampleCount,
          status: "available",
          cards: manifest.cards.map((card, index) =>
            index === 0
              ? {
                  cardId: card.id,
                  sampleCount,
                  status: "available",
                  counts,
                }
              : {
                  cardId: card.id,
                  sampleCount: 0,
                  status: "collecting",
                },
          ),
        },
      ],
    });
  });
}

test("offers sign-in when the saved account session has expired", async ({
  page,
}) => {
  await completedOwner(page);
  await page.route(`**/api/plays/${playId}`, (route) =>
    json(route, 401, {
      code: "OWNER_AUTH_REQUIRED",
      message: "로그인한 뒤 내 질문팩을 불러올 수 있어요.",
    }),
  );
  await page.goto(`/me/plays/${playId}`);

  await expect(
    page.getByRole("heading", { name: "다시 로그인해 주세요" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Google로 로그인" }),
  ).toHaveAttribute("href", "/auth/sign-in?returnTo=%2Fme");
});

test("creates the recommended public link and loses the raw URL on reload", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);

  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  await expect(page.getByRole("link", { name: "내 질문팩" })).toHaveAttribute(
    "href",
    "/me",
  );
  await expect(
    page.getByRole("link", { name: "내 시선 프로필" }),
  ).toHaveAttribute("href", `/me/profile/${playId}`);
  await expect(
    page.getByRole("radio", { name: /여러 친구에게 공개/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(page.getByText("공유 링크가 준비됐어요")).toBeVisible();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveValue(
    new RegExp(`#k=${secret}$`),
  );
  expect(
    share.calls.find(
      (call) => call.pathname.endsWith("/links") && call.method === "POST",
    )?.body,
  ).toEqual({ kind: "public" });

  await page.reload();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);
  await expect(page.getByText("사용 중")).toBeVisible();
  await expect(page.getByText(/공유하려면 새로 발급/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("creates a one-to-one link, rotates it, and disables the replacement", async ({
  page,
}) => {
  await completedOwner(page);
  await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("radio", { name: /한 친구에게 1:1/ }).check();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(page.getByText("1:1 친구")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "새로 발급" }).click();
  await expect(page.getByText("공유 링크가 준비됐어요")).toBeVisible();
  await expect(page.getByText("비활성", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);
  const activeOneToOne = page
    .getByRole("listitem")
    .filter({ hasText: "1:1 친구" })
    .filter({ hasText: "사용 중" });
  await expect(activeOneToOne).toHaveCount(1);
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "1:1 친구" })
      .filter({ has: page.getByText("비활성", { exact: true }) }),
  ).toHaveCount(1);

  page.once("dialog", (dialog) => dialog.accept());
  await activeOneToOne.getByRole("button", { name: "비활성화" }).click();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);
  await expect(page.getByText("사용 중")).toHaveCount(0);
});

test("attributes profile-entry share once despite same-tick activation", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "pending",
    clipboard: "resolve",
  });
  await completedOwner(page);
  const share = await installShareApi(page, { shareEventStatus: 500 });
  await page.goto(`/me/plays/${playId}?entry_source=profile_reshare`);
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();

  const shareButton = page.getByRole("button", { name: "친구에게 공유하기" });
  await expect(shareButton).toBeVisible();
  await shareButton.evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
    for (const candidate of document.querySelectorAll("button")) {
      if (
        ["공유 링크 만들기", "링크 복사", "새로 발급", "비활성화"].includes(
          candidate.textContent?.trim() ?? "",
        )
      ) {
        (candidate as HTMLButtonElement).click();
      }
    }
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __gyeopHandoff: { shareCalls: ShareData[] };
            }
          ).__gyeopHandoff.shareCalls.length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __gyeopHandoff: { copyCalls: string[] };
          }
        ).__gyeopHandoff.copyCalls,
    ),
  ).toEqual([]);
  expect(
    share.calls.filter(
      (call) =>
        call.method !== "GET" && !call.pathname.endsWith("/share-events"),
    ),
  ).toEqual([
    {
      method: "POST",
      pathname: `/api/plays/${playId}/links`,
      body: { kind: "public" },
    },
  ]);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __gyeopHandoff: { resolveShare?: () => void };
      }
    ).__gyeopHandoff.resolveShare?.();
  });
  await expect(page.getByRole("status")).toHaveText(
    "공유 메뉴로 링크를 전달했어요.",
  );
  await expect(shareButton).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __gyeopHandoff: { shareCalls: ShareData[] };
          }
        ).__gyeopHandoff.shareCalls[0],
    ),
  ).toEqual({
    title: "겹 · 우리는 아직도 통하는 편",
    text: '내가 먼저 답한 "우리는 아직도 통하는 편" 질문이야. 너는 나를 어떻게 보는지 3장만 골라줘.',
    url: `http://127.0.0.1:3000/i/${publicIds[0]}#k=${secret}`,
  });
  await expect
    .poll(() =>
      share.calls.filter((call) => call.pathname.endsWith("/share-events")),
    )
    .toEqual([
      {
        method: "POST",
        pathname: `/api/me/plays/${playId}/share-events`,
        body: {
          event: "share_handoff_succeeded",
          linkId: linkIds[0],
          entrySource: "profile_reshare",
        },
      },
    ]);
});

test("treats native share cancellation and failure as zero success events", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "cancel",
    clipboard: "resolve",
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  const button = page.getByRole("button", { name: "친구에게 공유하기" });

  await button.click();
  await expect(page.getByRole("status")).toHaveText(
    "공유를 취소했어요. 링크는 그대로 있어요.",
  );
  await expect(button).toBeFocused();
  await page.evaluate(() => {
    (
      window as typeof window & {
        __gyeopHandoff: { shareMode: "fail" };
      }
    ).__gyeopHandoff.shareMode = "fail";
  });
  await button.click();
  await expect(page.locator("aside").getByRole("alert")).toHaveText(
    "공유 메뉴를 열지 못했어요. 링크 복사를 사용해 주세요.",
  );
  await expect(button).toBeFocused();
  await expect(button).toBeEnabled();
  await expect(page.getByRole("button", { name: "링크 복사" })).toBeEnabled();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveValue(
    new RegExp(`#k=${secret}$`),
  );
  expect(
    share.calls.filter((call) => call.pathname.endsWith("/share-events")),
  ).toHaveLength(0);
});

test("normalizes an array entry source while copying a one-to-one link", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "unsupported",
    clipboard: "pending",
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&entry_source=anything`,
  );
  await page.getByRole("radio", { name: /한 친구에게 1:1/ }).check();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(
    page.getByRole("button", { name: "친구에게 공유하기" }),
  ).toHaveCount(0);
  const copyButton = page.getByRole("button", { name: "링크 복사" });
  await copyButton.evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __gyeopHandoff: { copyCalls: string[] };
            }
          ).__gyeopHandoff.copyCalls.length,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    (
      window as typeof window & {
        __gyeopHandoff: { resolveCopy?: () => void };
      }
    ).__gyeopHandoff.resolveCopy?.();
  });
  await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
  await expect(copyButton).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __gyeopHandoff: { copyCalls: string[] };
          }
        ).__gyeopHandoff.copyCalls,
    ),
  ).toEqual([`http://127.0.0.1:3000/i/${publicIds[0]}#k=${secret}`]);
  await expect
    .poll(() =>
      share.calls.filter((call) => call.pathname.endsWith("/share-events")),
    )
    .toEqual([
      {
        method: "POST",
        pathname: `/api/me/plays/${playId}/share-events`,
        body: {
          event: "share_link_copied",
          linkId: linkIds[0],
          entrySource: null,
        },
      },
    ]);
  expect(share.links[0]).toMatchObject({
    kind: "one_to_one",
    status: "active",
  });
});

test("focuses and selects the manual URL when clipboard fails", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "unsupported",
    clipboard: "fail",
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await page.getByRole("button", { name: "링크 복사" }).click();
  const manual = page.getByLabel("공유 링크 직접 복사");
  await expect(page.locator("aside").getByRole("alert")).toContainText(
    "자동 복사가 안 됐어요",
  );
  await expect(manual).toBeFocused();
  expect(
    await manual.evaluate((input) => ({
      start: (input as HTMLInputElement).selectionStart,
      end: (input as HTMLInputElement).selectionEnd,
      length: (input as HTMLInputElement).value.length,
    })),
  ).toEqual({
    start: 0,
    end: `http://127.0.0.1:3000/i/${publicIds[0]}#k=${secret}`.length,
    length: `http://127.0.0.1:3000/i/${publicIds[0]}#k=${secret}`.length,
  });
  expect(
    share.calls.filter((call) => call.pathname.endsWith("/share-events")),
  ).toHaveLength(0);
});

test("shares one threshold-safe 9:16 profile card with the public invite", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "resolve",
    clipboard: "resolve",
    fileShare: true,
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await installInsightProfileApi(page);
  const cardId = manifest.cards[0].id;
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=old_friend&share_card=${cardId}`,
  );

  await expect(
    page.getByRole("heading", { name: "내 겹 공유하기" }),
  ).toBeFocused();
  await expect(
    page.getByLabel("오래된 친구 시선 공유 카드 미리보기"),
  ).toContainText(manifest.cards[0].ownerPrompt);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "만든 링크" })).toHaveCount(0);
  await expect(page.getByText("한 친구에게 1:1")).toHaveCount(0);

  await page.getByRole("button", { name: "카드 공유 준비하기" }).click();
  const shareButton = page.getByRole("button", {
    name: "카드와 링크 공유하기",
  });
  await expect(shareButton).toBeVisible();
  await shareButton.click();
  await expect(page.getByRole("status")).toHaveText(
    "공유 메뉴로 카드와 링크를 전달했어요.",
  );

  const payload = await page.evaluate(async () => {
    const data = (
      window as typeof window & {
        __gyeopHandoff: { shareCalls: ShareData[] };
      }
    ).__gyeopHandoff.shareCalls[0];
    const file = data.files?.[0];
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const dimensions = {
      signature: Array.from(bytes.slice(0, 8)),
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
    return {
      ...dimensions,
      fileCount: data.files?.length,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      title: data.title,
      text: data.text,
      url: data.url,
    };
  });
  expect(payload).toEqual({
    width: 1080,
    height: 1920,
    signature: [137, 80, 78, 71, 13, 10, 26, 10],
    fileCount: 1,
    name: "gyeop-insight.png",
    type: "image/png",
    lastModified: 0,
    title: `겹 · ${manifest.title}`,
    text: `내가 먼저 답한 "${manifest.title}" 질문이야. 너는 나를 어떻게 보는지 3장만 골라줘.`,
    url: `http://127.0.0.1:3000/i/${publicIds[0]}#k=${secret}`,
  });
  expect(JSON.stringify(payload)).not.toMatch(
    new RegExp(`${playId}|${cardId}|old_friend|nickname`, "i"),
  );
  await expect
    .poll(() =>
      share.calls.filter((call) => call.pathname.endsWith("/share-events")),
    )
    .toEqual([
      {
        method: "POST",
        pathname: `/api/me/plays/${playId}/share-events`,
        body: {
          event: "share_handoff_succeeded",
          linkId: linkIds[0],
          entrySource: "profile_reshare",
        },
      },
    ]);
});

test("renders legal maximum Korean card copy into a 1080x1920 PNG", async ({
  page,
}) => {
  const ownerPrompt = `${"긴질문".repeat(66)}끝끝`;
  const optionA = "가".repeat(120);
  const optionB = "나".repeat(120);
  expect(ownerPrompt).toHaveLength(200);
  await installBrowserHandoff(page, {
    share: "resolve",
    clipboard: "resolve",
    fileShare: true,
  });
  await completedOwner(page);
  await installShareApi(page);
  await installInsightProfileApi(page, "old_friend", {
    ownerPrompt,
    optionA,
    optionB,
    counts: { a: 123, b: 456 },
  });
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=old_friend&share_card=${manifest.cards[0].id}`,
  );

  const preview = page.getByLabel("오래된 친구 시선 공유 카드 미리보기");
  await expect(preview).toContainText(ownerPrompt);
  await expect(preview).toContainText("123명");
  await expect(preview).toContainText("456명");
  await page.getByRole("button", { name: "카드 공유 준비하기" }).click();
  await page.getByRole("button", { name: "카드와 링크 공유하기" }).click();

  const png = await page.evaluate(async () => {
    const data = (
      window as typeof window & {
        __gyeopHandoff: { shareCalls: ShareData[] };
      }
    ).__gyeopHandoff.shareCalls[0];
    const file = data.files?.[0];
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    return {
      signature: Array.from(bytes.slice(0, 8)),
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  });
  expect(png).toEqual({
    signature: [137, 80, 78, 71, 13, 10, 26, 10],
    width: 1080,
    height: 1920,
  });
});

test("keeps card recovery available after AbortError without recording success", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "cancel",
    clipboard: "resolve",
    fileShare: true,
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await installInsightProfileApi(page);
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=old_friend&share_card=${manifest.cards[0].id}`,
  );
  await page.getByRole("button", { name: "카드 공유 준비하기" }).click();
  const shareButton = page.getByRole("button", {
    name: "카드와 링크 공유하기",
  });
  await shareButton.click();

  await expect(page.getByRole("status")).toHaveText(
    "공유를 취소했어요. 링크는 그대로 있어요.",
  );
  await expect(shareButton).toBeFocused();
  await expect(shareButton).toBeEnabled();
  await expect(page.getByRole("link", { name: "프로필로" })).toBeVisible();
  expect(
    share.calls.filter((call) => call.pathname.endsWith("/share-events")),
  ).toHaveLength(0);
});

test("keeps card mode isolated and falls back to image plus manual link copy", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "resolve",
    clipboard: "fail",
    fileShare: false,
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await installInsightProfileApi(page);
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=old_friend&share_card=${manifest.cards[0].id}`,
  );
  await page.getByRole("button", { name: "카드 공유 준비하기" }).click();

  await expect(
    page.getByRole("button", { name: "카드와 링크 공유하기" }),
  ).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "이미지 저장" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("gyeop-insight.png");
  await page.getByRole("button", { name: "링크 복사" }).click();
  const manual = page.getByLabel("공유 링크 직접 복사");
  await expect(manual).toBeFocused();
  await expect(manual).toHaveValue(new RegExp(`#k=${secret}$`));
  expect(
    share.calls.filter((call) => call.pathname.endsWith("/share-events")),
  ).toHaveLength(0);
});

test("keeps one card action usable without horizontal overflow at 320x568", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installBrowserHandoff(page, {
    share: "resolve",
    clipboard: "resolve",
    fileShare: true,
  });
  await completedOwner(page);
  await installShareApi(page);
  await installInsightProfileApi(page);
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=old_friend&share_card=${manifest.cards[0].id}`,
  );

  const main = page.locator("main");
  const prepare = main.getByRole("button", { name: "카드 공유 준비하기" });
  await expect(main.getByRole("button")).toHaveCount(1);
  expect((await prepare.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);

  await prepare.click();
  const share = main.getByRole("button", { name: "카드와 링크 공유하기" });
  await expect(main.getByRole("button")).toHaveCount(1);
  expect((await share.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
});

test("fails closed when a requested profile card is stale", async ({
  page,
}) => {
  await completedOwner(page);
  await installShareApi(page);
  await installInsightProfileApi(page);
  await page.goto(
    `/me/plays/${playId}?entry_source=profile_reshare&share_relationship=school_friend&share_card=${manifest.cards[0].id}`,
  );

  await expect(
    page.getByRole("heading", {
      name: "이 시선은 지금 공유할 수 없어요",
    }),
  ).toBeFocused();
  await expect(page.getByText("2명")).toHaveCount(0);
  await expect(page.locator("main").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("reads only an exact fragment and renders generic invite states", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/i/${publicIds[0]}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "이 사람과 어떤 사이인가요?" }),
  ).toBeFocused();
  await expect(page.getByText("여러 친구가 함께 참여")).toBeVisible();

  const inviteCalls = () =>
    share.calls.filter((call) => call.pathname.includes("/invites/"));
  expect(inviteCalls()).toHaveLength(2);
  await page.goto(`/i/${publicIds[0]}#k=${secret}&x=1`);
  await expect(
    page.getByRole("heading", { name: "이 초대는 지금 참여할 수 없어요" }),
  ).toBeFocused();
  expect(inviteCalls()).toHaveLength(2);
});

test("keeps retry primary and offers the pack catalog after an invite error", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page, { inviteFailures: 2 });
  await page.goto(`/i/${publicIds[0]}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "초대를 확인하지 못했어요" }),
  ).toBeFocused();
  const retry = page.getByRole("button", { name: "다시 시도" });
  const browse = page.getByRole("link", { name: "겹 둘러보기" });
  await expect(browse).toHaveAttribute("href", "/");

  const inviteMetadataCalls = () =>
    share.calls.filter(
      (call) =>
        call.method === "POST" &&
        call.pathname.startsWith("/api/invites/") &&
        !call.pathname.endsWith("/responses"),
    );
  expect(inviteMetadataCalls()).toHaveLength(1);
  await retry.click();
  await expect(
    page.getByRole("heading", { name: "초대를 확인하지 못했어요" }),
  ).toBeFocused();
  expect(inviteMetadataCalls()).toHaveLength(2);
  await browse.click();
  await expect(page).toHaveURL("/");
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps share and invite flows accessible at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installBrowserHandoff(page, {
      share: "unsupported",
      clipboard: "resolve",
    });
    await completedOwner(page);
    const share = await installShareApi(page);

    await page.goto(`/me/plays/${playId}`);
    const shareHeading = page.getByRole("heading", { name: "공유 링크" });
    const publicRadio = page.getByRole("radio", {
      name: /여러 친구에게 공개/,
    });
    await expect(shareHeading).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "내 시선 프로필" }),
    ).toBeFocused();
    await expect(page.getByRole("link", { name: "내 시선 프로필" })).toHaveCSS(
      "outline-color",
      "rgb(49, 92, 255)",
    );
    await page.keyboard.press("Tab");
    await expect(publicRadio).toBeFocused();
    expect(
      (await publicRadio.locator("..").boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (
        await page
          .getByRole("button", { name: "공유 링크 만들기" })
          .boundingBox()
      )?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const copyButton = page.getByRole("button", { name: "링크 복사" });
    const manualUrl = page.getByLabel("공유 링크 직접 복사");
    expect((await copyButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await manualUrl.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await copyButton.click();
    await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
    await expect(copyButton).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.goto(`/i/${publicIds[0]}#k=${secret}`);
    await expect(
      page.getByRole("heading", { name: "이 사람과 어떤 사이인가요?" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.goto(`/i/${publicIds[0]}#k=${secret}&x=1`);
    await expect(
      page.getByRole("heading", { name: "이 초대는 지금 참여할 수 없어요" }),
    ).toBeFocused();
    expect(
      (await page.getByRole("link", { name: "겹 둘러보기" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    share.failNextInvite();
    await page.goto(`/i/${publicIds[0]}#k=${secret}`);
    await expect(
      page.getByRole("heading", { name: "초대를 확인하지 못했어요" }),
    ).toBeFocused();
    const retry = page.getByRole("button", { name: "다시 시도" });
    const browse = page.getByRole("link", { name: "겹 둘러보기" });
    expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await browse.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(browse).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
