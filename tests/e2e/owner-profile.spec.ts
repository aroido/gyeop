import { expect, test, type Page, type Route } from "@playwright/test";

import manifest from "../../content/packs/old-friend-v2.json" with { type: "json" };

import { playId } from "./owner-flow-fixture";

type Counts = { a: number; b: number };
type RelationshipCard =
  | { cardId: string; sampleCount: number; status: "collecting" }
  | {
      cardId: string;
      sampleCount: number;
      status: "available";
      counts: Counts;
    };
type RelationshipLayer =
  | {
      relationshipCode: string;
      sightCount: 1 | 2;
      status: "collecting";
      cards: [];
    }
  | {
      relationshipCode: string;
      sightCount: number;
      status: "available";
      cards: RelationshipCard[];
    };
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
    counts: Counts | null;
  }>;
  relationshipLayers: RelationshipLayer[];
};

function layer(
  relationshipCode: string,
  sightCount: number,
  samples: Record<string, Counts> = {},
): RelationshipLayer {
  if (sightCount < 3) {
    return {
      relationshipCode,
      sightCount: sightCount as 1 | 2,
      status: "collecting",
      cards: [],
    };
  }
  return {
    relationshipCode,
    sightCount,
    status: "available",
    cards: manifest.cards.map((card) => {
      const counts = samples[card.id] ?? { a: 0, b: 0 };
      const sampleCount = counts.a + counts.b;
      return sampleCount < 3
        ? { cardId: card.id, sampleCount, status: "collecting" }
        : { cardId: card.id, sampleCount, status: "available", counts };
    }),
  };
}

function profile(relationshipLayers: RelationshipLayer[] = []): Profile {
  const sightCount = relationshipLayers.reduce(
    (total, relationship) => total + relationship.sightCount,
    0,
  );
  return {
    playId,
    packSlug: "old-friend",
    packVersion: manifest.version,
    packTitle: manifest.title,
    sightCount,
    sightStatus: sightCount === 0 ? "empty" : "has_sight",
    cards: manifest.cards.map((card, index) => {
      let sampleCount = 0;
      let a = 0;
      let b = 0;
      for (const relationship of relationshipLayers) {
        if (relationship.status !== "available") continue;
        const relationshipCard = relationship.cards[index];
        if (relationshipCard.status !== "available") continue;
        sampleCount += relationshipCard.sampleCount;
        a += relationshipCard.counts.a;
        b += relationshipCard.counts.b;
      }
      return {
        cardId: card.id,
        position: card.position,
        ownerPrompt: card.ownerPrompt,
        optionA: card.optionA,
        optionB: card.optionB,
        selfChoice: index % 2 === 0 ? ("a" as const) : ("b" as const),
        sampleCount,
        counts: sampleCount === 0 ? null : { a, b },
      };
    }),
    relationshipLayers,
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
      playId: string;
    }>,
  };
  await page.route("**/api/me/profile**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/me/profile/events") {
      state.eventCalls += 1;
      const body = request.postDataJSON() as {
        event: "profile_viewed" | "profile_reshare_clicked";
        playId: string;
      };
      expect(request.method()).toBe("POST");
      expect(["profile_viewed", "profile_reshare_clicked"]).toContain(
        body.event,
      );
      expect(body.playId).toBe(playId);
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

test("zero profile hides relationship controls and the reshare CTA", async ({
  page,
}) => {
  const api = await installProfileApi(page, profile());
  await page.goto(`/me/profile/${playId}`);

  await expect(
    page.getByRole("heading", { name: "내 시선 프로필", level: 1 }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "← 내 질문팩" })).toHaveAttribute(
    "href",
    "/me",
  );
  await expect(page.getByText("아직 도착한 시선이 없어요")).toBeVisible();
  await expect(page.getByRole("group", { name: "관계 선택" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "시선 더 모으기" })).toHaveCount(
    0,
  );
  await expect.poll(() => api.eventCalls).toBe(1);
  expect(api.eventBodies).toEqual([{ event: "profile_viewed", playId }]);
});

test("selects the first available relationship and keeps collecting counts hidden", async ({
  page,
}) => {
  await installProfileApi(
    page,
    profile([
      layer("old_friend", 2),
      layer("coworker", 3, {
        [manifest.cards[0].id]: { a: 2, b: 1 },
        [manifest.cards[1].id]: { a: 2, b: 0 },
      }),
    ]),
  );
  await page.goto(`/me/profile/${playId}`);

  const available = page.getByRole("button", {
    name: "직장 동료, 3명, 공개 가능",
  });
  await expect(available).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("직장 동료 시선 3개")).toContainText("2명");
  await expect(
    page.locator("article").filter({ hasText: "다음 질문 · 시선을 모으는 중" }),
  ).toContainText("2/3");

  const collecting = page.getByRole("button", {
    name: "오래된 친구, 2/3, 시선을 모으는 중",
  });
  await collecting.focus();
  await page.keyboard.press("Enter");
  await expect(collecting).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("시선을 모으는 중 · 2/3")).toBeVisible();
  await expect(page.getByText("직장 동료 시선", { exact: true })).toHaveCount(
    0,
  );
});

test("refreshes relationship layers deterministically", async ({ page }) => {
  const api = await installProfileApi(page, profile([layer("old_friend", 2)]));
  await page.goto(`/me/profile/${playId}`);
  await expect(page.getByText("새 시선 도착")).toBeVisible();
  await expect(page.getByText("시선을 모으는 중 · 2/3")).toBeVisible();

  api.profile = profile([
    layer("old_friend", 3, {
      [manifest.cards[0].id]: { a: 2, b: 1 },
    }),
    layer("family", 2),
  ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "오래된 친구, 3명, 공개 가능" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("오래된 친구 시선 3개")).toBeVisible();

  await page.reload();
  await expect(page.getByText("새 시선 도착")).toHaveCount(0);
  await expect(page.getByText("시선이 쌓여 있어요")).toBeVisible();
  await expect.poll(() => api.eventCalls).toBe(3);
});

for (const activation of ["pointer", "keyboard"] as const) {
  test(`${activation} profile reshare keeps the existing event contract`, async ({
    page,
  }) => {
    const api = await installProfileApi(
      page,
      profile([layer("old_friend", 1)]),
    );
    await page.goto(`/me/profile/${playId}`);
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
        { event: "profile_viewed", playId },
        { event: "profile_reshare_clicked", playId },
      ]);
  });
}

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
  await installProfileApi(
    page,
    profile([
      layer("old_friend", 3, {
        [manifest.cards[0].id]: { a: 2, b: 1 },
      }),
    ]),
  );
  await page.goto(`/me/profile/${playId}`);

  await expect(page.getByText("새 시선 도착")).toHaveCount(0);
  await expect(page.getByText("시선이 쌓여 있어요")).toBeVisible();
});

test("renders terminal and sign-in states without recording a view", async ({
  page,
}) => {
  const terminal = await installProfileApi(page, profile(), { status: 404 });
  await page.goto(`/me/profile/${playId}`);
  await expect(
    page.getByRole("heading", { name: "이 프로필을 열 수 없어요" }),
  ).toBeFocused();
  expect(terminal.eventCalls).toBe(0);

  await page.unrouteAll({ behavior: "wait" });
  const auth = await installProfileApi(page, profile(), { status: 401 });
  await page.goto(`/me/profile/${playId}`);
  await expect(
    page.getByRole("heading", { name: "다시 로그인해 주세요" }),
  ).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Google로 로그인" }),
  ).toHaveAttribute("href", "/auth/sign-in?returnTo=%2Fme");
  expect(auth.eventCalls).toBe(0);
});

for (const viewport of [
  { width: 320, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps the relationship profile usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installProfileApi(
      page,
      profile([
        layer("old_friend", 3, {
          [manifest.cards[0].id]: { a: 2, b: 1 },
        }),
        layer("social_follower", 2),
      ]),
    );
    await page.goto(`/me/profile/${playId}`);

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);
    expect(
      (
        await page
          .getByRole("button", { name: "오래된 친구, 3명, 공개 가능" })
          .boundingBox()
      )?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("link", { name: "시선 더 모으기" }).boundingBox())
        ?.height,
    ).toBeGreaterThanOrEqual(44);
  });
}
