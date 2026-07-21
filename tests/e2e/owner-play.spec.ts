import { expect, test } from "@playwright/test";

import {
  installOwnerFlowApi,
  openOwnerFlow,
  playId,
} from "./owner-flow-fixture";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("scrubs the pack open, reverses before the snap, and hands off to the question", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=old-friend");

  const overlay = page.locator('[data-opening-state="opening"]');
  const stage = page.getByTestId("pack-opening-stage");
  await expect(overlay).toBeVisible();
  await expect(stage).toHaveAttribute("data-renderer", "lottie");
  await expect(stage).toHaveAttribute("data-frame", "0");
  await expect
    .poll(() =>
      page
        .getByTestId("pack-opening-lottie")
        .locator('path[d]:not([d=""])')
        .count(),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "팩 열기" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );

  await page.mouse.wheel(0, 90);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-frame")))
    .toBeGreaterThan(24);
  const openedFrame = Number(await stage.getAttribute("data-frame"));

  await page.mouse.wheel(0, -90);
  await expect
    .poll(async () => Number(await stage.getAttribute("data-frame")))
    .toBeLessThan(openedFrame - 16);

  await page.mouse.wheel(0, 240);
  await page.waitForURL(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeFocused();
  await expect(page.locator("[data-opening-state]")).toHaveCount(0);
  expect(
    api.calls.filter(
      (call) => call.method === "POST" && call.pathname === "/api/plays",
    ),
  ).toHaveLength(1);
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps the Lottie stage inside the ${viewport.width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installOwnerFlowApi(page, { createDelayMs: 2_000 });
    await page.goto("/play/new?pack=old-friend");

    const stage = page.getByTestId("pack-opening-stage");
    await expect(stage).toHaveAttribute("data-renderer", "lottie");
    const stageBox = await stage.boundingBox();
    const canvasBox = await page
      .getByTestId("pack-opening-lottie")
      .boundingBox();
    expect(stageBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    expect(
      Math.abs((stageBox?.width ?? 0) / (stageBox?.height ?? 1) - 9 / 13),
    ).toBeLessThanOrEqual(0.02);
    expect((stageBox?.width ?? 0) / viewport.width).toBeGreaterThanOrEqual(0.8);
    expect((stageBox?.width ?? 0) / viewport.width).toBeLessThanOrEqual(0.96);
    expect(stageBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((stageBox?.x ?? 0) + (stageBox?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    );
    expect(canvasBox).toEqual(stageBox);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
  });
}

test("keeps a usable static pack when the Lottie asset fails", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/animations/gyeop-pack-opening.json", (route) =>
    route.abort(),
  );
  await installOwnerFlowApi(page, { createDelayMs: 2_000 });
  await page.goto("/play/new?pack=old-friend");

  const stage = page.getByTestId("pack-opening-stage");
  await expect(stage).toHaveAttribute("data-renderer", "fallback");
  await expect(stage).not.toHaveAttribute("data-opened");

  await page.getByRole("button", { name: "팩 열기" }).click();
  await expect(
    page.locator('[data-opening-state="opened-waiting"]'),
  ).toBeVisible();
  await expect(stage).toHaveAttribute("data-opened", "true");
  await expect(stage).toHaveAttribute("data-renderer", "fallback");
  await page.waitForURL(`/play/${playId}`);
});

test("opens from the keyboard button and waits in the extracted pose for a slow API", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installOwnerFlowApi(page, { createDelayMs: 2_000 });
  await page.goto("/play/new?pack=old-friend");

  await page.getByRole("button", { name: "팩 열기" }).click();
  await expect(
    page.locator('[data-opening-state="opened-waiting"]'),
  ).toBeVisible();
  await expect(page.getByText("첫 질문을 준비하고 있어요…")).toBeVisible();
  await expect(page).toHaveURL(/\/play\/new\?pack=old-friend$/);

  await page.waitForURL(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeFocused();
});

test("removes the handoff overlay when the routed owner read fails", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installOwnerFlowApi(page, { readMissingCount: 1 });
  await page.goto("/play/new?pack=old-friend");
  await page.getByRole("button", { name: "팩 열기" }).click();

  await page.waitForURL(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "이 팩을 이어갈 수 없어요" }),
  ).toBeFocused();
  await expect(page.locator("[data-opening-state]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "다른 팩 고르기" }),
  ).toBeVisible();
});

test("keeps the extracted card while the routed owner read is slow", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installOwnerFlowApi(page, { readDelayMs: 1_000 });
  await page.goto("/play/new?pack=old-friend");
  await page.getByRole("button", { name: "팩 열기" }).click();

  await page.waitForURL(`/play/${playId}`);
  await expect(
    page.locator('[data-opening-state="route-loading"]'),
  ).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeFocused();
  await expect(page.locator("[data-opening-state]")).toHaveCount(0);
});

test("removes the handoff overlay when the routed pack read fails", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installOwnerFlowApi(page, { packFailureCount: 1 });
  await page.goto("/play/new?pack=old-friend");
  await page.getByRole("button", { name: "팩 열기" }).click();

  await page.waitForURL(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "이 팩을 이어갈 수 없어요" }),
  ).toBeFocused();
  await expect(page.locator("[data-opening-state]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "다시 불러오기" }),
  ).toBeVisible();
});

test("bootstraps once and shows the first server-backed question", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page);
  await openOwnerFlow(page, api);

  const createCalls = api.calls.filter(
    (call) => call.method === "POST" && call.pathname === "/api/plays",
  );
  expect(createCalls).toHaveLength(1);
  expect(createCalls[0]?.body).toEqual({
    packSlug: "old-friend",
    entrySource: "home",
  });
  expect(api.calls.slice(0, 3).map((call) => call.pathname)).toEqual([
    "/api/plays",
    `/api/plays/${playId}`,
    "/api/packs/old-friend",
  ]);
  await expect(page.locator('main[data-pack="old-friend"]')).toHaveCount(1);
  await expect(page.getByTestId("question-card")).toHaveCSS(
    "background-color",
    "rgb(223, 255, 0)",
  );
  await expect(page.locator('[data-state="auto"]')).toBeVisible();
});

test("starts a new owner play without an intermediate gate", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=old-friend");
  await expect(
    page.getByRole("heading", {
      name: "서운한 일이 생기면 나는?",
    }),
  ).toBeVisible();
  expect(
    api.calls.filter(
      (call) => call.method === "POST" && call.pathname === "/api/plays",
    ),
  ).toHaveLength(1);
});

test("starts an expanded active pack without the generic error boundary", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, { packSlug: "deadline-mode" });
  await page.goto("/play/new?pack=deadline-mode");

  await expect(
    page.getByRole("heading", { name: "마감이 잡히면 나는?" }),
  ).toBeVisible();
  await expect(page.locator('main[data-pack="deadline-mode"]')).toHaveCount(1);
  expect(
    api.calls.find(
      (call) => call.method === "POST" && call.pathname === "/api/plays",
    )?.body,
  ).toEqual({ packSlug: "deadline-mode", entrySource: "home" });
});

test("reports the reviewed same-pack entry source", async ({ page }) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=old-friend&source=same_pack_cta");
  await page.waitForURL(`/play/${playId}`);

  expect(
    api.calls.find(
      (call) => call.method === "POST" && call.pathname === "/api/plays",
    )?.body,
  ).toEqual({
    packSlug: "old-friend",
    entrySource: "same_pack_cta",
  });
});

test("rejects a non-UUID play path without an owner API request", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/not-a-pack");
  await expect(
    page.getByRole("heading", { name: "이 팩을 이어갈 수 없어요" }),
  ).toBeFocused();
  expect(api.calls).toHaveLength(0);
});

test("offers sign-in when an account-owned play requires authentication", async ({
  page,
}) => {
  await installOwnerFlowApi(page);
  await page.route(`**/api/plays/${playId}`, (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify({
        code: "OWNER_AUTH_REQUIRED",
        message: "로그인한 뒤 내 질문팩을 불러올 수 있어요.",
      }),
    }),
  );
  await page.goto(`/play/${playId}`);

  await expect(
    page.getByRole("heading", { name: "다시 로그인해 주세요" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Google로 로그인" }),
  ).toHaveAttribute("href", "/auth/sign-in?returnTo=%2Fme");
  await expect(
    page.getByRole("button", { name: "다른 팩 고르기" }),
  ).toHaveCount(0);
});

test("shows Google as the only owner sign-in path", async ({ page }) => {
  await page.goto("/auth/sign-in?returnTo=%2Fme");

  await expect(
    page.getByRole("heading", { name: "내 질문팩 불러오기" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Google로 계속하기" }),
  ).toHaveAttribute("href", "/auth/google?returnTo=%2Fme");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText(/매직 링크|카카오|네이버/)).toHaveCount(0);
  const testOnlyStatus = await page.evaluate(async () => {
    const response = await fetch("/api/auth/test-magic-link", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "disabled@example.com",
        playId: null,
        returnTo: "/me",
      }),
    });
    return response.status;
  });
  expect(testOnlyStatus).toBe(404);

  const invalidStarts = await page.evaluate(async () =>
    Promise.all(
      [
        "/auth/google?returnTo=https%3A%2F%2Fexample.com%2Fme",
        "/auth/google?returnTo=%2Fme&returnTo=%2Fme",
        "/auth/google?returnTo=%2Fme&extra=1",
      ].map((path) => fetch(path).then((response) => response.status)),
    ),
  );
  expect(invalidStarts).toEqual([400, 400, 400]);

  await page.goto(
    "/auth/callback?error=access_denied&error_description=cancelled",
  );
  await expect(page).toHaveURL("/auth/sign-in?error=callback");
  await expect(
    page.getByText("Google 로그인을 완료하지 못했어요. 다시 시도해 주세요."),
  ).toBeVisible();
});

test("rejects an unknown bootstrap pack without an API request", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=unknown");
  await expect(
    page.getByRole("heading", { name: "팩을 시작하지 못했어요" }),
  ).toBeFocused();
  await expect(page.getByRole("button", { name: "홈으로" })).toBeVisible();
  expect(api.calls).toHaveLength(0);
});

test("returns to pack selection only after the generic terminal session is cleared", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, { readMissingCount: 1 });
  await page.goto(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "이 팩을 이어갈 수 없어요" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "다른 팩 고르기" }).click();
  await page.waitForURL("/");
  await expect(
    page.getByRole("heading", {
      name: "친구가 보는 나는 내가 아는 나와 같을까?",
    }),
  ).toBeVisible();
  expect(api.calls.slice(0, 2).map((call) => call.method)).toEqual([
    "GET",
    "DELETE",
  ]);
});

test("restores server answers when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => {
          throw new Error("storage unavailable");
        },
      });
    }
  });
  await openOwnerFlow(page);
  await page.locator('button[data-choice="a"]').click();
  await expect(page.locator('[data-state="saved"]')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeVisible();
});

test("moves optimistically within 150ms while a save is delayed", async ({
  page,
}) => {
  await openOwnerFlow(
    page,
    await installOwnerFlowApi(page, { saveDelayMs: 400 }),
  );
  await page.locator('button[data-choice="a"]').evaluate((button) => {
    button.addEventListener(
      "click",
      () => {
        (window as typeof window & { ownerClickAt?: number }).ownerClickAt =
          performance.now();
      },
      { once: true },
    );
  });
  await page.locator('button[data-choice="a"]').click();
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeVisible();
  const latency = await page.evaluate(
    () =>
      performance.now() -
      ((window as typeof window & { ownerClickAt: number }).ownerClickAt ?? 0),
  );
  expect(latency).toBeLessThanOrEqual(150);
  await expect(page.locator('[data-state="saving"]')).toBeVisible();
});

test("serializes rapid same-card edits and restores the final choice", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, { saveDelayMs: 120 });
  await openOwnerFlow(page, api);

  await page.locator('button[data-choice="a"]').click();
  await page.getByRole("button", { name: "이전" }).click();
  await page.locator('button[data-choice="b"]').click();
  await expect(page.locator('[data-state="saved"]')).toBeVisible();

  const saves = api.calls.filter((call) => call.method === "PUT");
  expect(saves.map((call) => (call.body as { choice: string }).choice)).toEqual(
    ["a", "b"],
  );
  expect(api.state.answers[0]).toEqual({ cardId: "conflict", choice: "b" });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이전" }).click();
  await expect(page.locator('button[data-choice="b"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("holds all later choices behind a failed save and completes after retry", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, { failSaveCount: 1 });
  await openOwnerFlow(page, api);

  for (let index = 0; index < 10; index += 1) {
    await page.locator('button[data-choice="a"]').click();
  }
  await expect(
    page.getByRole("button", { name: "저장 실패 · 재시도" }),
  ).toBeVisible();
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/complete")),
  ).toHaveLength(0);

  await page.getByRole("button", { name: "저장 실패 · 재시도" }).click();
  await expect(
    page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
  ).toBeFocused();
  expect(api.state.answers).toHaveLength(10);
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/complete")),
  ).toHaveLength(1);

  await page.reload();
  const completedHeading = page.getByRole("heading", {
    name: "내 답변 10개가 저장됐어요",
  });
  await expect(completedHeading).toBeFocused();
  await expect(page.locator("[data-choice]")).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "내 선택 10장" }).getByRole("listitem"),
  ).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: "내 질문팩 저장하고 공유하기" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  const saveButton = page.getByRole("button", {
    name: "내 질문팩 저장하고 공유하기",
  });
  await expect(saveButton).toBeFocused();
  await expect(saveButton).toHaveCSS("outline-color", "rgb(49, 92, 255)");
});

test("exposes an explicit completion retry after authoritative ten-answer incomplete", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, { incompleteCompleteCount: 1 });
  await openOwnerFlow(page, api);
  for (let index = 0; index < 10; index += 1) {
    await page.locator('button[data-choice="a"]').click();
  }
  await expect(
    page.getByRole("button", { name: "완료 다시 시도" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "완료 다시 시도" }).click();
  await expect(
    page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
  ).toBeVisible();
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/complete")),
  ).toHaveLength(2);
});

test("rehydrates the first missing card after authoritative nine-answer incomplete", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page, {
    incompleteCompleteCount: 1,
    incompleteAnswerCount: 9,
  });
  await openOwnerFlow(page, api);
  for (let index = 0; index < 10; index += 1) {
    await page.locator('button[data-choice="a"]').click();
  }

  await expect(
    page.getByRole("heading", { name: "힘든 날에 나는?" }),
  ).toBeVisible();
  await expect(page.locator('button[data-choice="a"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "완료 다시 시도" }),
  ).toHaveCount(0);
  expect(api.state.answers).toHaveLength(9);
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/complete")),
  ).toHaveLength(1);
});

test("distinguishes saved and pending exit guidance", async ({ page }) => {
  const api = await installOwnerFlowApi(page, { saveDelayMs: 400 });
  await openOwnerFlow(page, api);

  await page.getByRole("button", { name: "나가기" }).click();
  await expect(
    page.getByRole("heading", { name: "지금까지 자동 저장됐어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 답하기" }).click();
  await expect(page.getByRole("button", { name: "나가기" })).toBeFocused();

  await page.locator('button[data-choice="a"]').click();
  await page.getByRole("button", { name: "나가기" }).click();
  await expect(
    page.getByRole("heading", { name: "아직 저장하지 못한 답이 있어요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "그래도 나가기" }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`fits ${viewport.width}px with keyboard, 44px controls, and no storage writes`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openOwnerFlow(page);

    const layout = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      ownerStorageKeys: [
        ...Object.keys(localStorage),
        ...Object.keys(sessionStorage),
      ].filter((key) => key.toLowerCase().includes("gyeop")),
    }));
    expect(layout).toEqual({
      overflow: false,
      ownerStorageKeys: [],
    });

    for (const control of await page
      .locator("main button:not([disabled])")
      .all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "나가기" })).toBeFocused();
    await expect(page.getByLabel("질문 진행률")).toHaveAttribute("max", "10");
    await expect(page.getByTestId("question-card")).toHaveCSS(
      "transition-duration",
      "0s",
    );
  });
}
