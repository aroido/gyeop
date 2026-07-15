import { expect, test } from "@playwright/test";

test("renders the old-friend pack shell and exposes its prepared state", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("겹", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "오래된 친구팩" }),
  ).toBeVisible();
  await expect(page.getByText("질문 10장", { exact: true })).toBeVisible();

  const cta = page.getByRole("link", { name: "팩 열어보기" });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/#start-status$/);
  await expect(page.getByText("답변 흐름을 준비 중이에요.")).toBeVisible();
});

test("fits a 320px viewport and keeps the CTA keyboard accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);

  const cta = page.getByRole("link", { name: "팩 열어보기" });
  const box = await cta.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Tab");
  await expect(cta).toBeFocused();
  const outlineStyle = await cta.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  );
  expect(outlineStyle).not.toBe("none");
});
