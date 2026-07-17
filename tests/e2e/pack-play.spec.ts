import { expect, test } from "@playwright/test";

const packCases = [
  {
    slug: "first-impression",
    title: "첫인상팩",
    storageKey: "gyeop:first-impression-play:v1",
    first: "처음 만난 자리에서 나는?",
    second: "처음 대화를 시작할 때 나는?",
    third: "낯선 사람들이 모인 자리에 가면 나는?",
  },
  {
    slug: "coworker",
    title: "직장동료팩",
    storageKey: "gyeop:coworker-play:v1",
    first: "업무가 애매하게 주어지면 나는?",
    second: "회의에서 의견이 생기면 나는?",
    third: "집중이 필요할 때 나는?",
  },
  {
    slug: "honest-self",
    title: "솔직한 나팩",
    storageKey: "gyeop:honest-self-play:v1",
    first: "마음이 복잡한 날 나는?",
    second: "칭찬을 들으면 나는?",
    third: "중요한 선택 앞에서 나는?",
  },
] as const;

const storageKeys = [
  "gyeop:old-friend-play:v1",
  ...packCases.map((pack) => pack.storageKey),
];

for (const pack of packCases) {
  test(`${pack.title} 선택, 복구, 완료, 재시작`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/play/${pack.slug}`);

    await expect(page.getByText(`겹 · ${pack.title}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: pack.first })).toBeFocused();

    await page.locator('button[data-choice="a"]').click();
    await expect(
      page.getByRole("heading", { name: pack.second }),
    ).toBeFocused();

    await page.locator('button[data-choice="b"]').click();
    await expect(page.getByRole("heading", { name: pack.third })).toBeFocused();

    await page.getByRole("button", { name: "이전 질문" }).click();
    await expect(
      page.getByRole("heading", { name: pack.second }),
    ).toBeFocused();
    await expect(page.locator('button[data-choice="b"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.locator('button[data-choice="a"]').click();
    await page.reload();
    await expect(page.getByRole("heading", { name: pack.third })).toBeVisible();

    for (let index = 2; index < 10; index += 1) {
      await page.locator('button[data-choice="a"]').click();
    }

    await expect(
      page.getByRole("heading", { name: "나의 10장을 모두 골랐어요" }),
    ).toBeFocused();
    await expect(
      page.getByRole("list", { name: "내 선택 10장" }).getByRole("listitem"),
    ).toHaveCount(10);
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? Object.keys(JSON.parse(raw).answers).length : 0;
        }, pack.storageKey),
      )
      .toBe(10);

    for (const otherKey of storageKeys.filter(
      (key) => key !== pack.storageKey,
    )) {
      expect(
        await page.evaluate((key) => localStorage.getItem(key), otherKey),
      ).toBeNull();
    }

    await page.getByRole("button", { name: "처음부터 다시 하기" }).click();
    await expect(page.getByRole("heading", { name: pack.first })).toBeFocused();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), pack.storageKey),
    ).toBeNull();
  });
}

test("등록되지 않은 팩은 404", async ({ page }) => {
  const response = await page.goto("/play/not-a-pack");
  expect(response?.status()).toBe(404);
});
