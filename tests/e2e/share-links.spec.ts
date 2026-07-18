import { expect, test, type Page, type Route } from "@playwright/test";

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
  options: { shareEventStatus?: 204 | 500 } = {},
) {
  const links: LinkState[] = [];
  const calls: { method: string; pathname: string; body?: unknown }[] = [];
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
    if (method === "POST" && url.pathname.startsWith("/api/invites/")) {
      return json(route, 200, {
        packSlug: "old-friend",
        packVersion: "old-friend-v1",
        packTitle: "오래된 친구팩",
        kind: "public",
      });
    }
    return route.fallback();
  });
  return { links, calls };
}

async function installBrowserHandoff(
  page: Page,
  options: {
    share: "unsupported" | "resolve" | "cancel" | "fail" | "pending";
    clipboard: "resolve" | "fail";
  },
) {
  await page.addInitScript((initial) => {
    type HandoffState = {
      shareMode: typeof initial.share;
      clipboardMode: typeof initial.clipboard;
      shareCalls: ShareData[];
      copyCalls: string[];
      resolveShare?: () => void;
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
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          state.copyCalls.push(value);
          if (state.clipboardMode === "fail") {
            throw new DOMException("failed", "NotAllowedError");
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

test("creates the recommended public link and loses the raw URL on reload", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);

  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
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

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "비활성화" }).click();
  await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);
  await expect(page.getByText("사용 중")).toHaveCount(0);
});

test("hands off the exact public link once despite same-tick activation", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "pending",
    clipboard: "resolve",
  });
  await completedOwner(page);
  const share = await installShareApi(page, { shareEventStatus: 500 });
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();

  const shareButton = page.getByRole("button", { name: "친구에게 공유하기" });
  await expect(shareButton).toBeVisible();
  await shareButton.evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
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
    title: "겹 · 오래된 친구팩",
    text: "내가 먼저 답한 오래된 친구팩이야. 너는 나를 어떻게 보는지 3장만 골라줘.",
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
  expect(
    share.calls.filter((call) => call.pathname.endsWith("/share-events")),
  ).toHaveLength(0);
});

test("copies a one-to-one link without a fake share control", async ({
  page,
}) => {
  await installBrowserHandoff(page, {
    share: "unsupported",
    clipboard: "resolve",
  });
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("radio", { name: /한 친구에게 1:1/ }).check();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(
    page.getByRole("button", { name: "친구에게 공유하기" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "링크 복사" }).click();
  await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
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
        body: { event: "share_link_copied", linkId: linkIds[0] },
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

test("reads only an exact fragment and renders generic invite states", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/i/${publicIds[0]}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "친구가 먼저 답한 질문팩이에요" }),
  ).toBeFocused();
  await expect(page.getByText("여러 친구가 함께 참여")).toBeVisible();

  const inviteCalls = () =>
    share.calls.filter((call) => call.pathname.includes("/invites/"));
  expect(inviteCalls()).toHaveLength(1);
  await page.goto(`/i/${publicIds[0]}#k=${secret}&x=1`);
  await expect(
    page.getByRole("heading", { name: "이 초대는 지금 참여할 수 없어요" }),
  ).toBeFocused();
  expect(inviteCalls()).toHaveLength(1);
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
    await completedOwner(page);
    await installShareApi(page);

    await page.goto(`/me/plays/${playId}`);
    const shareHeading = page.getByRole("heading", { name: "공유 링크" });
    const publicRadio = page.getByRole("radio", {
      name: /여러 친구에게 공개/,
    });
    await expect(shareHeading).toBeFocused();
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

    await page.goto(`/i/${publicIds[0]}#k=${secret}`);
    await expect(
      page.getByRole("heading", { name: "친구가 먼저 답한 질문팩이에요" }),
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
  });
}
