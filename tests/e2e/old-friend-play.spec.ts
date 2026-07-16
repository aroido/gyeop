import { expect, test, type Page } from "@playwright/test";

const storageKey = "gyeop:old-friend-play:v1";

async function openPlay(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/play/old-friend");
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
}

test("opens for at least one second unless reduced motion is requested", async ({
  page,
}) => {
  await page.goto("/play/old-friend");
  await expect(
    page.getByRole("heading", { name: "질문 카드를 여는 중이에요" }),
  ).toBeVisible();

  await page.waitForTimeout(700);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible({ timeout: 1_000 });
});

test("supports previous answers, reload recovery, completion, and restart", async ({
  page,
}) => {
  await openPlay(page);

  await page.locator('button[data-choice="a"]').click();
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeFocused();

  await page.locator('button[data-choice="b"]').click();
  await expect(
    page.getByRole("heading", { name: "약속을 잡을 때 나는?" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "이전 질문" }).click();
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeFocused();
  await expect(page.locator('button[data-choice="b"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.locator('button[data-choice="a"]').click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "약속을 잡을 때 나는?" }),
  ).toBeVisible();

  for (let index = 2; index < 10; index += 1) {
    await page.locator('button[data-choice="a"]').click();
  }

  await expect(
    page.getByRole("heading", { name: "나의 10장을 모두 골랐어요" }),
  ).toBeFocused();
  await expect(
    page.getByRole("list", { name: "내 선택 10장" }).getByRole("listitem"),
  ).toHaveCount(10);

  await page.getByRole("button", { name: "처음부터 다시 하기" }).click();
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(([key]) => localStorage.getItem(key), [storageKey]),
    )
    .toBeNull();
});

test("rejects invalid drafts and normalizes the current card", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ([key]) => {
      if (window.sessionStorage.getItem("invalid-draft-seeded")) return;
      window.localStorage.setItem(key, "{");
      window.sessionStorage.setItem("invalid-draft-seeded", "true");
    },
    [storageKey],
  );
  await page.goto("/play/old-friend");
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();

  await page.evaluate(
    ([key]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          currentIndex: 8,
          answers: { conflict: "a", reunion: "b" },
        }),
      ),
    [storageKey],
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "약속을 잡을 때 나는?" }),
  ).toBeVisible();

  await page.evaluate(
    ([key]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          currentIndex: 0,
          answers: { conflict: "a", reunion: "b" },
        }),
      ),
    [storageKey],
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
  await expect(page.locator('button[data-choice="a"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.evaluate(
    ([key]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          currentIndex: 0,
          answers: { unknown: "x" },
        }),
      ),
    [storageKey],
  );
  await page.reload();
  await expect(page.locator('button[data-choice="a"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("keeps working when browser storage throws", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  await page.goto("/play/old-friend");

  for (let index = 0; index < 10; index += 1) {
    await page.locator('button[data-choice="a"]').click();
  }
  await expect(
    page.getByRole("heading", { name: "나의 10장을 모두 골랐어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "처음부터 다시 하기" }).click();
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
});

test("fits 320px, exposes accessible controls, and makes no app requests", async ({
  page,
}) => {
  const appRequests: string[] = [];
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType())) {
      appRequests.push(request.url());
    }
  });

  await page.setViewportSize({ width: 320, height: 800 });
  await openPlay(page);

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const choices = page.locator("button[data-choice]");
  await expect(choices).toHaveCount(2);
  for (const choice of await choices.all()) {
    const box = await choice.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(52);
    await expect(choice).toHaveAttribute("aria-pressed", "false");
  }

  await expect(
    page.getByRole("progressbar", { name: "질문 진행률" }),
  ).toHaveAttribute("max", "10");
  expect(appRequests).toEqual([]);
});
