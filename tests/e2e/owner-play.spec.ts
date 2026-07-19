import { expect, test } from "@playwright/test";

import {
  installOwnerFlowApi,
  openOwnerFlow,
  playId,
} from "./owner-flow-fixture";
import { confirmEligibility } from "./eligibility-fixture";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
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
    eligibilityConfirmed: true,
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

test("blocks an ineligible owner before the create request", async ({
  page,
}) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=old-friend");
  await expect(
    page.getByRole("checkbox", {
      name: "만 19세 이상이며 대한민국에서 이용 중이에요.",
    }),
  ).not.toBeChecked();
  expect(api.calls).toHaveLength(0);
  await page.getByRole("button", { name: "아직 만 19세가 아니에요" }).click();
  await expect(
    page.getByRole("heading", { name: "지금은 겹을 이용할 수 없어요" }),
  ).toBeFocused();
  await expect(
    page.getByText("답변이나 프로필은 저장되지 않았어요."),
  ).toBeVisible();
  expect(api.calls).toHaveLength(0);
});

test("reports the reviewed same-pack entry source", async ({ page }) => {
  const api = await installOwnerFlowApi(page);
  await page.goto("/play/new?pack=old-friend&source=same_pack_cta");
  await confirmEligibility(page);
  await page.waitForURL(`/play/${playId}`);

  expect(
    api.calls.find(
      (call) => call.method === "POST" && call.pathname === "/api/plays",
    )?.body,
  ).toEqual({
    packSlug: "old-friend",
    entrySource: "same_pack_cta",
    eligibilityConfirmed: true,
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
    page.getByRole("button", { name: "내 시선 프로필" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const profileButton = page.getByRole("button", { name: "내 시선 프로필" });
  await expect(profileButton).toBeFocused();
  await expect(profileButton).toHaveCSS("outline-color", "rgb(49, 92, 255)");
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
