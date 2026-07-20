import { expect, test } from "@playwright/test";

import { installOwnerFlowApi, playId } from "./owner-flow-fixture";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("shows four active private-MVP packs before the owner flow", async ({
  page,
}) => {
  await installOwnerFlowApi(page);
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
    "오래 본 너의 시선",
    "처음 만난 너의 시선",
    "같이 일한 너의 시선",
    "가까운 너의 시선",
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
  const packLinks = page.getByRole("link", { name: "질문 시작하기" });
  await expect(packLinks).toHaveCount(4);
  await expect(packLinks.first()).toHaveAttribute(
    "href",
    "/play/new?pack=old-friend",
  );
  await expect(page.getByText("준비 중", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("[data-choice]")).toHaveCount(0);
  await expect(
    page.getByText(
      "생년월일이나 신분증 없이 질문에 답하고 서로의 시선을 비교해요.",
      { exact: false },
    ),
  ).toBeVisible();
  const policyLink = page.getByRole("link", { name: "정책과 문의" });
  await policyLink.focus();
  await policyLink.press("Enter");
  await expect(
    page.getByRole("heading", { name: "개인정보와 문의" }),
  ).toBeVisible();
  await expect(page.getByText("문의 접수 채널을 준비 중이에요.")).toBeVisible();
  await page.getByRole("link", { name: "홈으로" }).click();

  await packLinks.first().click();

  await expect(page).toHaveURL(`/play/${playId}`);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeVisible();
});

test("supports keyboard pack preview navigation", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const rail = page.getByTestId("pack-rail");
  const cta = page.getByRole("link", { name: "질문 시작하기" }).first();
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

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
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
      name: "처음 만난 너의 시선",
    });
    const cta = page.getByRole("link", { name: "질문 시작하기" }).first();
    const ctaBox = await cta.boundingBox();
    const secondPackBox = await secondPack.boundingBox();
    expect(ctaBox?.height).toBeGreaterThanOrEqual(44);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(secondPackBox!.x).toBeLessThan(viewport.width);

    const titleLineCounts = await page
      .locator('[data-pack-state="active"] h3')
      .evaluateAll((headings) =>
        headings.map((heading) => {
          const style = getComputedStyle(heading);
          return heading.clientHeight / parseFloat(style.lineHeight);
        }),
      );
    expect(titleLineCounts).toHaveLength(4);
    expect(titleLineCounts.every((lineCount) => lineCount <= 2.05)).toBe(true);

    await page.keyboard.press("Tab");
    await expect(rail).toBeFocused();
  });
}
