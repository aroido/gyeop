import { expect, test, type Page, type Route } from "@playwright/test";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const responseId = "22000000-0000-4000-8000-000000000001";
const storageKey = `gyeop:visitor-management:v1:${responseId}`;

async function installManagementRecord(page: Page) {
  await page.addInitScript(
    ({ key, response, token }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          responseId: response,
          status: "completed",
          secret: token,
        }),
      );
    },
    { key: storageKey, response: responseId, token: secret },
  );
}

function privateJson(route: Route, status: number, body: unknown, extra = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store", ...extra },
    body: JSON.stringify(body),
  });
}

test("removes the fragment before confirmation and withdraws only on click", async ({
  page,
}) => {
  await installManagementRecord(page);
  const requests: Array<{ method: string; body: string | null }> = [];
  await page.route("**/api/responses/withdraw", async (route) => {
    requests.push({
      method: route.request().method(),
      body: route.request().postData(),
    });
    if (requests.length === 1) {
      await route.fulfill({
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
      return;
    }
    await privateJson(route, 404, {
      code: "RESPONSE_MANAGEMENT_UNAVAILABLE",
      message: "이 관리 링크는 사용할 수 없어요.",
    });
  });

  await page.goto(`/responses/manage#token=${secret}`);
  await expect(
    page.getByRole("heading", { name: "이 답변을 지울까요?" }),
  ).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("#token=");
  expect(requests).toHaveLength(0);

  const keep = page.getByRole("link", { name: "답변 남겨두기" });
  const withdraw = page.getByRole("button", { name: "이 답변 철회하기" });
  const keepBox = await keep.boundingBox();
  const withdrawBox = await withdraw.boundingBox();
  expect(keepBox!.y).toBeLessThan(withdrawBox!.y);
  expect(keepBox!.height).toBeGreaterThanOrEqual(44);
  expect(withdrawBox!.height).toBeGreaterThanOrEqual(44);

  await withdraw.click();
  await expect(
    page.getByRole("heading", { name: "답변을 철회했어요" }),
  ).toBeVisible();
  expect(requests).toEqual([
    { method: "POST", body: JSON.stringify({ token: secret }) },
  ]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(null);

  await page.goto(`/responses/manage#token=${secret}`);
  await expect(
    page.getByRole("heading", { name: "이 답변을 지울까요?" }),
  ).toBeVisible();
  await expect.poll(() => page.url()).not.toContain("#token=");
  await page.getByRole("button", { name: "이 답변 철회하기" }).click();
  await expect(
    page.getByRole("heading", {
      name: "이 관리 링크는 사용할 수 없어요",
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
});

test("keeps the in-memory capability for a transient retry", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/responses/withdraw", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await privateJson(route, 500, {
        code: "INTERNAL_ERROR",
        message: "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }
    await route.fulfill({
      status: 204,
      headers: { "cache-control": "private, no-store" },
    });
  });

  await page.goto(`/responses/manage#token=${secret}`);
  await page.getByRole("button", { name: "이 답변 철회하기" }).click();
  await expect(
    page.getByRole("heading", { name: "답변을 철회하지 못했어요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(
    page.getByRole("heading", { name: "답변을 철회했어요" }),
  ).toBeVisible();
  expect(attempts).toBe(2);
});

test("converges wrong and reused capabilities on one terminal screen", async ({
  page,
}) => {
  await installManagementRecord(page);
  await page.route("**/api/responses/withdraw", (route) =>
    privateJson(route, 404, {
      code: "RESPONSE_MANAGEMENT_UNAVAILABLE",
      message: "이 관리 링크는 사용할 수 없어요.",
    }),
  );

  await page.goto(`/responses/manage#token=${secret}`);
  await page.getByRole("button", { name: "이 답변 철회하기" }).click();
  await expect(
    page.getByRole("heading", {
      name: "이 관리 링크는 사용할 수 없어요",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe(null);
});

test("shows retry-after without revealing capability state", async ({
  page,
}) => {
  await page.route("**/api/responses/withdraw", (route) =>
    privateJson(
      route,
      429,
      { code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." },
      { "retry-after": "37" },
    ),
  );

  await page.goto(`/responses/manage#token=${secret}`);
  await page.getByRole("button", { name: "이 답변 철회하기" }).click();
  await expect(
    page.getByRole("heading", { name: "잠시 후 다시 시도해 주세요" }),
  ).toBeVisible();
  await expect(page.getByText(/37초/)).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`keeps withdrawal controls usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/responses/manage#token=${secret}`);
    await expect(
      page.getByRole("heading", { name: "이 답변을 지울까요?" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
  });
}

test("unsupported withdrawal methods stay private", async ({ request }) => {
  for (const method of [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ] as const) {
    const response = await request.fetch("/api/responses/withdraw", { method });
    expect(response.status(), method).toBe(405);
    expect(response.headers()["allow"]).toBe("POST");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
});
