import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("starts with the first real question", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "서운한 일이 생기면 나는?",
    }),
  ).toBeVisible();
  await expect(page.getByText("겹 · 오래된 친구팩")).toBeVisible();
  await expect(page.getByText("1 / 10", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  await expect(page.getByText("내가 먼저 답하면")).toHaveCount(0);
  await expect(page.getByText("추천 관계")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);

  const firstChoice = page.getByRole("button", {
    name: "A 바로 이야기한다",
  });
  await expect(firstChoice).toBeEnabled();
  await firstChoice.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
  ).toBeVisible();
  await expect(page.getByText("2 / 10", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.localStorage.getItem("gyeop:old-friend-play:v1"),
      ),
    )
    .toContain('"conflict":"a"');
});

test("keeps the first action inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    horizontalOverflow:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
    verticalOverflow:
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
  }));
  expect(layout).toEqual({
    horizontalOverflow: false,
    verticalOverflow: false,
  });

  const choices = page.locator("[data-choice]");
  await expect(choices).toHaveCount(2);
  for (const choice of await choices.all()) {
    const box = await choice.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800);
  }

  await page.keyboard.press("Tab");
  await expect(choices.first()).toBeFocused();
  await expect(choices.first()).toHaveCSS("outline-style", /^(?!none$).+/);
});
