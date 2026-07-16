import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("explains the first pack and starts the local owner flow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "오래 본 친구는 나를 어떻게 기억할까?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "오래된 친구팩" }),
  ).toBeVisible();

  for (const fact of [
    "오래된 친구",
    "A/B 10장 · 약 2분",
    "따뜻한 회상",
    "낮은 민감도 · 공개 추천",
  ]) {
    await expect(page.getByText(fact, { exact: true })).toBeVisible();
  }

  const cta = page.getByRole("link", { name: "팩 열어보기" });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/\/play\/old-friend$/);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
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

  const intro = await page.getByTestId("home-intro").boundingBox();
  const pack = await page.getByTestId("pack-card").boundingBox();
  expect(intro).not.toBeNull();
  expect(pack).not.toBeNull();
  expect(pack!.y - (intro!.y + intro!.height)).toBeLessThanOrEqual(48);

  const cta = page.getByRole("link", { name: "팩 열어보기" });
  const box = await cta.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);

  await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();
  await expect(cta).toHaveCSS("outline-style", /^(?!none$).+/);
});
