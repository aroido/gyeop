import { expect, test, type Page, type Route } from "@playwright/test";

const publicId = "AAAAAAAAAAAAAAAAAAAAAA";
const oneToOneId = "AQEBAQEBAQEBAQEBAQEBAQ";
const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const responseId = "22000000-0000-4000-8000-000000000001";

type ResponseState = {
  id: string;
  status: "draft";
  relationshipCode: string;
  relationshipLabel: string;
  knownSinceCode: string;
  knownSinceLabel: string;
  sessionExpiresAt: string;
  sessionTtlSeconds: number;
};

function json(route: Route, status: number, body: unknown, extra = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store", ...extra },
    body: JSON.stringify(body),
  });
}

async function installVisitorApi(
  page: Page,
  options: { rateLimitFirstStart?: boolean } = {},
) {
  let saved: ResponseState | null = null;
  let starts = 0;
  const calls: { pathname: string; body: unknown }[] = [];
  await page.route("**/api/invites/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as {
      intent?: "resume" | "start";
      relationshipCode?: string;
      knownSinceCode?: string;
    };
    calls.push({ pathname: url.pathname, body });
    if (url.pathname.endsWith("/metadata")) {
      return json(route, 200, {
        packSlug: "old-friend",
        packVersion: "old-friend-v1",
        packTitle: "오래된 친구팩",
        kind: url.pathname.includes(oneToOneId) ? "one_to_one" : "public",
      });
    }
    if (!url.pathname.endsWith("/responses")) return route.fallback();
    if (body.intent === "resume") {
      return saved
        ? json(route, 200, saved)
        : route.fulfill({
            status: 204,
            headers: { "cache-control": "private, no-store" },
            body: "",
          });
    }
    starts += 1;
    if (options.rateLimitFirstStart && starts === 1) {
      return json(
        route,
        429,
        { code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." },
        { "retry-after": "17" },
      );
    }
    saved = {
      id: responseId,
      status: "draft",
      relationshipCode: body.relationshipCode!,
      relationshipLabel:
        body.relationshipCode === "old_friend" ? "오래된 친구" : "가족",
      knownSinceCode: body.knownSinceCode!,
      knownSinceLabel:
        body.knownSinceCode === "ten_years_or_more"
          ? "10년 이상이에요"
          : "잘 모르겠어요",
      sessionExpiresAt: "2030-01-02T00:00:00Z",
      sessionTtlSeconds: 86_400,
    };
    return json(route, 201, saved);
  });
  return { calls, starts: () => starts };
}

test("starts once, restores the saved relationship, and stays mobile-safe", async ({
  page,
}) => {
  const api = await installVisitorApi(page);
  await page.goto(`/i/${publicId}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "이 사람과 어떤 사이인가요?" }),
  ).toBeFocused();
  const submit = page.getByRole("button", { name: "3장 답하러 가기" });
  await expect(submit).toBeDisabled();
  await page.getByRole("radio", { name: "오래된 친구" }).check();
  await page.getByRole("radio", { name: "10년 이상이에요" }).check();
  await submit.evaluate((button) => {
    (button as HTMLElement).click();
    (button as HTMLElement).click();
  });
  await expect(
    page.getByRole("heading", { name: "응답을 시작했어요" }),
  ).toBeFocused();
  expect(api.starts()).toBe(1);
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/responses")),
  ).toEqual([
    {
      pathname: `/api/invites/${publicId}/responses`,
      body: { intent: "resume", secret },
    },
    {
      pathname: `/api/invites/${publicId}/responses`,
      body: {
        intent: "start",
        secret,
        relationshipCode: "old_friend",
        knownSinceCode: "ten_years_or_more",
      },
    },
  ]);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "응답을 시작했어요" }),
  ).toBeFocused();
  await expect(page.getByText("오래된 친구", { exact: true })).toBeVisible();
  await expect(
    page.getByText("10년 이상이에요", { exact: true }),
  ).toBeVisible();
  expect(api.starts()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("keeps choices after a rate limit and retries without a default", async ({
  page,
}) => {
  const api = await installVisitorApi(page, { rateLimitFirstStart: true });
  await page.goto(`/i/${publicId}#k=${secret}`);
  await expect(page.getByRole("radio")).toHaveCount(14);
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "가족", exact: true }).check();
  await page.getByRole("radio", { name: "잘 모르겠어요" }).check();
  await page.getByRole("button", { name: "3장 답하러 가기" }).click();
  await expect(
    page.getByText("잠시 후 다시 시도해 주세요.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "가족", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "잘 모르겠어요" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "3장 답하러 가기" }).click();
  await expect(
    page.getByRole("heading", { name: "응답을 시작했어요" }),
  ).toBeVisible();
  expect(api.starts()).toBe(2);
});

test("keeps one-to-one invites info-only without starting a response", async ({
  page,
}) => {
  const api = await installVisitorApi(page);
  await page.goto(`/i/${oneToOneId}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "친구가 먼저 답한 질문팩이에요" }),
  ).toBeFocused();
  await expect(
    page.getByText("1:1 응답은 다음 단계에서 이어져요."),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(
    api.calls.filter((call) => call.pathname.endsWith("/responses")),
  ).toHaveLength(0);
});

for (const width of [320, 390, 430]) {
  test(`keeps all response controls usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installVisitorApi(page);
    await page.goto(`/i/${publicId}#k=${secret}`);
    const radios = page.getByRole("radio");
    expect(
      (await radios.first().locator("..").boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await radios.nth(0).check();
    await page.getByRole("radio", { name: "잘 모르겠어요" }).check();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      (
        await page
          .getByRole("button", { name: "3장 답하러 가기" })
          .boundingBox()
      )?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
  });
}
