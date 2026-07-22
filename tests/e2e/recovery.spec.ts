import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const errorSource = readFileSync(
  new URL("../../app/error.tsx", import.meta.url),
  "utf8",
);

test("keeps the root error boundary generic and wired to reset", () => {
  expect(errorSource).toContain('"use client"');
  expect(errorSource).toContain("onClick={reset}");
  expect(errorSource).toContain('href="/"');
  expect(errorSource).not.toMatch(
    /error\.(?:message|name|stack|cause|digest)|\{error\}/,
  );
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`recovers from a missing page at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "이 페이지를 찾을 수 없어요" }),
    ).toBeFocused();
    const browse = page.getByRole("link", { name: "질문팩 둘러보기" });
    await expect(browse).toHaveAttribute("href", "/");
    expect((await browse.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    await expect(browse).toBeFocused();
    await browse.click();
    await expect(page).toHaveURL("/");
  });
}
