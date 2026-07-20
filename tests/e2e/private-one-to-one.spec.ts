import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import manifest from "../../content/packs/old-friend-v1.json" with { type: "json" };

import { installOwnerFlowApi, playId } from "./owner-flow-fixture";

const responseId = "28000000-0000-4000-8000-000000000001";
const shareLinkId = "28100000-0000-4000-8000-000000000001";
const submitted = {
  id: responseId,
  shareLinkId,
  status: "submitted" as const,
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  submittedAt: "2030-01-02T00:00:00Z",
  withdrawnAt: null,
};
const comparison = {
  id: responseId,
  packTitle: manifest.title,
  relationshipCode: "old_friend",
  knownSinceCode: "ten_years_or_more",
  submittedAt: submitted.submittedAt,
  allMatched: false,
  assignments: [
    {
      cardId: manifest.cards[0].id,
      stage: "required",
      position: 1,
      packPosition: manifest.cards[0].position,
      visitorPrompt: manifest.cards[0].visitorPrompt,
      optionA: manifest.cards[0].optionA,
      optionB: manifest.cards[0].optionB,
      isSignature: manifest.cards[0].isSignature,
      visitorChoice: "b",
      ownerChoice: "a",
      matches: false,
      isHighlight: true,
    },
    ...manifest.cards.slice(1, 3).map((card, index) => ({
      cardId: card.id,
      stage: "required",
      position: index + 2,
      packPosition: card.position,
      visitorPrompt: card.visitorPrompt,
      optionA: card.optionA,
      optionB: card.optionB,
      isSignature: card.isSignature,
      visitorChoice: "a",
      ownerChoice: "a",
      matches: true,
      isHighlight: false,
    })),
    {
      cardId: manifest.cards[3].id,
      stage: "optional",
      position: 1,
      packPosition: manifest.cards[3].position,
      visitorPrompt: manifest.cards[3].visitorPrompt,
      optionA: manifest.cards[3].optionA,
      optionB: manifest.cards[3].optionB,
      isSignature: manifest.cards[3].isSignature,
      visitorChoice: "a",
      ownerChoice: "a",
      matches: true,
      isHighlight: false,
    },
  ],
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function completedOwner(page: Page) {
  const owner = await installOwnerFlowApi(page);
  owner.state.status = "completed";
  owner.state.answers = manifest.cards.map((card) => ({
    cardId: card.id,
    choice: "a",
  }));
  owner.state.currentPosition = 10;
}

async function installPrivateApi(
  page: Page,
  options: { withdrawn?: boolean; raceWithdrawal?: boolean } = {},
) {
  const state = {
    withdrawn: options.withdrawn ?? false,
    calls: [] as string[],
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/me/plays/${playId}/links`
    ) {
      return json(route, 200, { links: [] });
    }
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/me/plays/${playId}/responses`
    ) {
      state.calls.push(`${url.pathname}${url.search}`);
      expect(url.search).toBe("?kind=one_to_one");
      return json(route, 200, {
        responses: state.withdrawn
          ? [
              {
                ...submitted,
                status: "withdrawn",
                relationshipCode: null,
                knownSinceCode: null,
                withdrawnAt: "2030-01-03T00:00:00Z",
              },
            ]
          : [submitted],
      });
    }
    if (
      route.request().method() === "GET" &&
      url.pathname === `/api/me/responses/${responseId}`
    ) {
      state.calls.push(url.pathname);
      if (options.raceWithdrawal) {
        state.withdrawn = true;
        return json(route, 404, {
          code: "OWNER_PLAY_NOT_FOUND",
          message: "진행 중인 팩을 찾을 수 없습니다.",
        });
      }
      return json(route, 200, comparison);
    }
    return route.fallback();
  });
  return state;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("shows a name-free private list and card comparison", async ({ page }) => {
  await completedOwner(page);
  const api = await installPrivateApi(page);
  await page.goto(`/me/plays/${playId}`);

  await expect(
    page.getByRole("heading", { name: "1:1로 본 우리" }),
  ).toBeVisible();
  await expect(page.getByText("오래된 친구 · 10년 이상이에요")).toBeVisible();
  await expect(page.getByText(/방문자 이름|닉네임/)).toHaveCount(0);

  await page.getByRole("button", { name: "비교 보기" }).click();
  const detailHeading = page.getByRole("heading", {
    name: "둘만 보는 1:1 비교",
  });
  await expect(detailHeading).toBeFocused();
  await expect(page.getByText("내 실제 답")).toHaveCount(4);
  await expect(page.getByText("친구가 본 나")).toHaveCount(4);
  await expect(page.getByText("가장 다른 답")).toHaveCount(1);
  await expect(page.getByText("더 보기 1")).toBeVisible();
  await expect(page.getByText("더 보기 2")).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((finding) =>
      ["critical", "serious"].includes(finding.impact ?? ""),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "1:1 목록으로" }).click();
  await expect(page.getByRole("button", { name: "비교 보기" })).toBeVisible();
  expect(api.calls).toEqual([
    `/api/me/plays/${playId}/responses?kind=one_to_one`,
    `/api/me/responses/${responseId}`,
    `/api/me/plays/${playId}/responses?kind=one_to_one`,
  ]);
});

test("refreshes to a non-actionable tombstone when withdrawal races detail", async ({
  page,
}) => {
  await completedOwner(page);
  await installPrivateApi(page, { raceWithdrawal: true });
  await page.goto(`/me/plays/${playId}`);

  await page.getByRole("button", { name: "비교 보기" }).click();
  await expect(
    page.getByText("답변 상태가 바뀌어 목록을 다시 불러왔어요."),
  ).toBeVisible();
  await expect(page.getByText("철회된 1:1 답변")).toBeVisible();
  await expect(page.getByText("비교 내용은 남아 있지 않아요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "비교 보기" })).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
  test(`keeps the private section usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await completedOwner(page);
    await installPrivateApi(page, { withdrawn: true });
    await page.goto(`/me/plays/${playId}`);
    await expect(page.getByText("철회된 1:1 답변")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
