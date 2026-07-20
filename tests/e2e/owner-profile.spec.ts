import { expect, test, type Page, type Route } from "@playwright/test";

import manifest from "../../content/packs/old-friend-v1.json" with { type: "json" };

import { playId } from "./owner-flow-fixture";

type Counts = { a: number; b: number } | null;
type Profile = {
  playId: string;
  packSlug: "old-friend";
  packVersion: string;
  packTitle: string;
  sightCount: number;
  sightStatus: "empty" | "has_sight";
  cards: Array<{
    cardId: string;
    position: number;
    ownerPrompt: string;
    optionA: string;
    optionB: string;
    selfChoice: "a" | "b";
    sampleCount: number;
    counts: Counts;
  }>;
};

function profile(sightCount = 0, firstSampleCount = 0): Profile {
  return {
    playId,
    packSlug: "old-friend",
    packVersion: manifest.version,
    packTitle: manifest.title,
    sightCount,
    sightStatus: sightCount === 0 ? "empty" : "has_sight",
    cards: manifest.cards.map((card, index) => ({
      cardId: card.id,
      position: card.position,
      ownerPrompt: card.ownerPrompt,
      optionA: card.optionA,
      optionB: card.optionB,
      selfChoice: index % 2 === 0 ? "a" : "b",
      sampleCount: index === 0 ? firstSampleCount : 0,
      counts:
        index === 0 && firstSampleCount >= 3
          ? { a: firstSampleCount - 1, b: 1 }
          : null,
    })),
  };
}

function noStoreJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function installProfileApi(
  page: Page,
  initial: Profile,
  options: { status?: number } = {},
) {
  const state = {
    profile: initial,
    eventCalls: 0,
    eventBodies: [] as Array<{
      event: "profile_viewed" | "profile_reshare_clicked";
    }>,
  };
  await page.route("**/api/me/profile**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/me/profile/events") {
      state.eventCalls += 1;
      expect(request.method()).toBe("POST");
      const body = request.postDataJSON() as {
        event: "profile_viewed" | "profile_reshare_clicked";
      };
      expect(["profile_viewed", "profile_reshare_clicked"]).toContain(
        body.event,
      );
      state.eventBodies.push(body);
      return route.fulfill({
        status: 204,
        headers: { "cache-control": "private, no-store" },
        body: "",
      });
    }
    if (pathname === "/api/me/profile") {
      expect(request.method()).toBe("GET");
      return noStoreJson(
        route,
        options.status ?? 200,
        options.status
          ? {
              code: "OWNER_PLAY_NOT_FOUND",
              message: "진행 중인 팩을 찾을 수 없습니다.",
            }
          : state.profile,
      );
    }
    return route.fallback();
  });
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("renders the private zero-sight profile and records viewing after render", async ({
  page,
}) => {
  const api = await installProfileApi(page, profile());
  await page.goto("/me");

  await expect(
    page.getByRole("heading", { name: "내 시선 프로필", level: 1 }),
  ).toBeFocused();
  await expect(page.getByText("아직 도착한 시선이 없어요")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(10);
  await expect(page.getByText("시선을 모으는 중 · 0/3")).toHaveCount(10);
  await expect(page.getByText("친구 시선", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "시선 더 모으기" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Shift+Tab");
  const backLink = page.getByRole("link", { name: "← 내 답변" });
  await expect(backLink).toBeFocused();
  await expect(backLink).toHaveCSS("outline-color", "rgb(49, 92, 255)");
  await expect.poll(() => api.eventCalls).toBe(1);
  expect(api.eventBodies).toEqual([{ event: "profile_viewed" }]);
});

test("reveals exact counts at three samples and shows each increase only once", async ({
  page,
}) => {
  const api = await installProfileApi(page, profile(2, 2));
  await page.goto("/me");
  await expect(page.getByText("새 시선 도착")).toBeVisible();
  await expect(page.getByText("시선을 모으는 중 · 2/3")).toBeVisible();
  await expect(page.getByText("A · 바로 이야기한다")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "시선 더 모으기" }),
  ).toHaveAttribute("href", `/me/plays/${playId}?entry_source=profile_reshare`);

  api.profile = profile(3, 3);
  await page.reload();
  await expect(page.getByText("새 시선 도착")).toBeVisible();
  const aggregate = page.getByLabel("친구 시선 3개");
  await expect(aggregate.getByText("A · 바로 이야기한다")).toBeVisible();
  await expect(aggregate.getByText("2명")).toBeVisible();
  await expect(aggregate.getByText("1명")).toBeVisible();

  await page.reload();
  await expect(page.getByText("새 시선 도착")).toHaveCount(0);
  await expect(page.getByText("시선이 쌓여 있어요")).toBeVisible();
  await expect.poll(() => api.eventCalls).toBe(3);
});

test("refreshes newly submitted public sights when the owner returns", async ({
  page,
}) => {
  const api = await installProfileApi(page, profile());
  await page.goto("/me");
  await expect(page.getByText("아직 도착한 시선이 없어요")).toBeVisible();

  api.profile = profile(1, 1);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );

  await expect(page.getByText("새 시선 도착")).toBeVisible();
  await expect(page.getByText("시선을 모으는 중 · 1/3")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "시선 더 모으기" }),
  ).toBeVisible();
});

for (const activation of ["pointer", "keyboard"] as const) {
  test(`${activation} profile reshare records the click and keeps the same play`, async ({
    page,
  }) => {
    const api = await installProfileApi(page, profile(1, 1));
    await page.goto("/me");
    const cta = page.getByRole("link", { name: "시선 더 모으기" });
    if (activation === "pointer") {
      await cta.click();
    } else {
      await cta.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(
      `/me/plays/${playId}?entry_source=profile_reshare`,
    );
    await expect
      .poll(() => api.eventBodies)
      .toEqual([
        { event: "profile_viewed" },
        { event: "profile_reshare_clicked" },
      ]);
  });
}

test("deduplicates same-tick profile reshare activation", async ({ page }) => {
  const api = await installProfileApi(page, profile(1, 1));
  await page.goto("/me");
  await page
    .getByRole("link", { name: "시선 더 모으기" })
    .evaluate((element) => {
      (element as HTMLElement).click();
      (element as HTMLElement).click();
    });
  await expect(page).toHaveURL(
    `/me/plays/${playId}?entry_source=profile_reshare`,
  );
  await expect
    .poll(() => api.eventBodies)
    .toEqual([
      { event: "profile_viewed" },
      { event: "profile_reshare_clicked" },
    ]);
});

test("never claims a new sight when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: () => {
          throw new Error("storage unavailable");
        },
      });
    }
  });
  await installProfileApi(page, profile(3, 3));
  await page.goto("/me");

  await expect(page.getByText("새 시선 도착")).toHaveCount(0);
  await expect(page.getByText("시선이 쌓여 있어요")).toBeVisible();
});

test("renders one generic terminal state without recording a view", async ({
  page,
}) => {
  const api = await installProfileApi(page, profile(), { status: 404 });
  await page.goto("/me");

  await expect(
    page.getByRole("heading", { name: "이 프로필을 열 수 없어요" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "홈으로" })).toBeVisible();
  expect(api.eventCalls).toBe(0);
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps the owner profile usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installProfileApi(page, profile(3, 3));
    await page.goto("/me");

    await expect(
      page.getByRole("heading", { name: "내 시선 프로필", level: 1 }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    expect(
      (await page.getByRole("link", { name: "시선 더 모으기" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
  });
}
