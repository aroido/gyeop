import { expect, test } from "@playwright/test";

const storageKey = "gyeop:old-friend-play:v1";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("shows GYEOP and multiple pack previews before the owner flow", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "친구가 보는 나는 내가 아는 나와 같을까?",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("겹")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "질문팩" }),
  ).toBeVisible();

  for (const title of [
    "오래된 친구팩",
    "첫인상팩",
    "직장동료팩",
    "솔직한 나팩",
  ]) {
    await expect(
      page.getByRole("heading", { level: 3, name: title }),
    ).toBeAttached();
  }

  const activePacks = page.locator('[data-pack-state="active"]');
  await expect(activePacks).toHaveCount(4);
  await expect(activePacks.getByText("지금 시작", { exact: true })).toHaveCount(
    4,
  );
  const packLinks = page.getByRole("link", { name: "팩 열어보기" });
  await expect(packLinks).toHaveCount(4);
  for (const [index, href] of [
    "/play/old-friend",
    "/play/first-impression",
    "/play/coworker",
    "/play/honest-self",
  ].entries()) {
    await expect(packLinks.nth(index)).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("[data-choice]")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBeNull();

  const cta = packLinks.first();
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(/\/play\/old-friend$/);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
});

test("supports keyboard pack preview navigation", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const rail = page.getByTestId("pack-rail");
  const cta = page.getByRole("link", { name: "팩 열어보기" }).first();
  await page.keyboard.press("Tab");
  await expect(rail).toBeFocused();
  await expect(rail).toHaveCSS("outline-style", /^(?!none$).+/);

  const initialScroll = await rail.evaluate((element) => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(initialScroll);

  await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();
});

test("renders the approved old-friend CSS cover recipe", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-cover-variant="old-friend-card-v1"]');
  await expect(card).toHaveCount(1);
  const computed = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrix(style.transform);
    return {
      background: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow,
      rotation: Math.atan2(matrix.b, matrix.a) * (180 / Math.PI),
    };
  });
  expect({ ...computed, rotation: undefined }).toEqual({
    background: "rgb(223, 255, 0)",
    color: "rgb(5, 5, 5)",
    boxShadow: "rgb(49, 92, 255) 5.6px 5.6px 0px 0px",
    rotation: undefined,
  });
  expect(computed.rotation).toBeCloseTo(-0.7, 5);
});

test("preserves an existing owner draft", async ({ page }) => {
  const draft = JSON.stringify({
    version: 1,
    currentIndex: 1,
    answers: { conflict: "a" },
  });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: storageKey, value: draft },
  );

  await page.goto("/");

  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBe(draft);
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 430, height: 932 },
]) {
  test(`fits the landing inside ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
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

    const rail = page.getByTestId("pack-rail");
    const secondPack = page.getByRole("heading", {
      level: 3,
      name: "첫인상팩",
    });
    const cta = page.getByRole("link", { name: "팩 열어보기" }).first();
    const ctaBox = await cta.boundingBox();
    const secondPackBox = await secondPack.boundingBox();
    expect(ctaBox?.height).toBeGreaterThanOrEqual(44);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(secondPackBox!.x).toBeLessThan(viewport.width);

    await page.keyboard.press("Tab");
    await expect(rail).toBeFocused();
  });
}
