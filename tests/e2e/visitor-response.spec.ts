import { expect, test, type Page, type Route } from "@playwright/test";

const publicId = "AAAAAAAAAAAAAAAAAAAAAA";
const oneToOneId = "AQEBAQEBAQEBAQEBAQEBAQ";
const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const responseId = "22000000-0000-4000-8000-000000000001";

type Assignment = {
  cardId: string;
  stage: "required";
  position: 1 | 2 | 3;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
  visitorChoice: "a" | "b" | null;
};
type DraftResponse = {
  id: string;
  status: "draft";
  relationshipCode: string;
  relationshipLabel: string;
  knownSinceCode: string;
  knownSinceLabel: string;
  sessionExpiresAt: string;
  sessionTtlSeconds: number;
  assignments: Assignment[];
};
type SubmittedResponse = Omit<DraftResponse, "status" | "assignments"> & {
  status: "submitted";
  allMatched: boolean;
  assignments: Array<
    Omit<Assignment, "visitorChoice"> & {
      visitorChoice: "a" | "b";
      ownerChoice: "a" | "b";
      matches: boolean;
      isHighlight: boolean;
    }
  >;
};
type ResponseState = DraftResponse | SubmittedResponse;

const assignments: Assignment[] = [
  {
    cardId: "conflict",
    stage: "required",
    position: 1,
    visitorPrompt: "서운한 일이 생기면 이 사람은?",
    optionA: "바로 이야기한다",
    optionB: "생각을 정리한 뒤 말한다",
    isSignature: true,
    visitorChoice: null,
  },
  {
    cardId: "hard-day",
    stage: "required",
    position: 2,
    visitorPrompt: "힘든 날에 이 사람은?",
    optionA: "먼저 연락해 털어놓는다",
    optionB: "혼자 정리한 뒤 연락한다",
    isSignature: false,
    visitorChoice: null,
  },
  {
    cardId: "plans",
    stage: "required",
    position: 3,
    visitorPrompt: "약속을 잡을 때 이 사람은?",
    optionA: "미리 날짜를 정한다",
    optionB: "그때그때 편한 날을 본다",
    isSignature: false,
    visitorChoice: null,
  },
];

function json(route: Route, status: number, body: unknown, extra = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store", ...extra },
    body: JSON.stringify(body),
  });
}

async function installClipboard(
  page: Page,
  outcome: "success" | "failure" = "success",
) {
  await page.addInitScript((clipboardOutcome) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if (clipboardOutcome === "failure")
            throw new DOMException("denied", "NotAllowedError");
          (window as typeof window & { __copied?: string }).__copied = value;
        },
      },
    });
  }, outcome);
}

async function installVisitorApi(
  page: Page,
  options: {
    rateLimitFirstStart?: boolean;
    failFirstSave?: boolean;
    kind?: "public" | "one_to_one";
  } = {},
) {
  let saved: ResponseState | null = null;
  let starts = 0;
  let saveFailures = 0;
  let consumed = false;
  const calls: { pathname: string; method: string; body: unknown }[] = [];

  await page.route("**/api/invites/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON() as {
      intent?: "resume" | "start";
      relationshipCode?: string;
      knownSinceCode?: string;
    };
    calls.push({ pathname: url.pathname, method: request.method(), body });
    if (url.pathname.endsWith("/metadata")) {
      if (consumed) {
        return json(route, 404, {
          code: "INVITE_UNAVAILABLE",
          message: "이 초대는 사용할 수 없습니다.",
        });
      }
      return json(route, 200, {
        packSlug: "old-friend",
        packVersion: "old-friend-v1",
        packTitle: "오래된 친구팩",
        kind:
          options.kind ??
          (url.pathname.includes(oneToOneId) ? "one_to_one" : "public"),
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
      sessionExpiresAt: "2099-01-02T00:00:00Z",
      sessionTtlSeconds: 86_400,
      assignments: structuredClone(assignments),
    };
    return json(route, 201, saved);
  });

  await page.route("**/api/responses/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.method() === "GET" ? null : request.postDataJSON();
    calls.push({ pathname: url.pathname, method: request.method(), body });
    if (!saved) {
      return json(route, 404, {
        code: "INVITE_UNAVAILABLE",
        message: "이 초대는 사용할 수 없습니다.",
      });
    }
    if (request.method() === "GET") return json(route, 200, saved);
    if (url.pathname.endsWith("/events")) {
      return route.fulfill({
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
    }
    if (url.pathname.endsWith("/submit")) {
      if (
        saved.status !== "draft" ||
        saved.assignments.some(({ visitorChoice }) => visitorChoice === null)
      ) {
        return json(route, 409, {
          code: "VISITOR_RESPONSE_INCOMPLETE",
          message: "세 장에 모두 답한 뒤 제출해 주세요.",
        });
      }
      const differences = saved.assignments.filter(
        ({ visitorChoice }) => visitorChoice !== "a",
      );
      const highlight =
        differences.find(({ isSignature }) => isSignature) ?? differences[0];
      saved = {
        ...saved,
        status: "submitted",
        allMatched: differences.length === 0,
        assignments: saved.assignments.map((assignment) => ({
          ...assignment,
          visitorChoice: assignment.visitorChoice!,
          ownerChoice: "a",
          matches: assignment.visitorChoice === "a",
          isHighlight: assignment.cardId === highlight?.cardId,
        })),
      };
      consumed = options.kind === "one_to_one";
      return json(route, 200, saved);
    }
    const match = url.pathname.match(/\/answers\/([^/]+)$/);
    if (request.method() === "PUT" && match && saved.status === "draft") {
      if (options.failFirstSave && saveFailures === 0) {
        saveFailures += 1;
        return json(route, 503, {
          code: "INTERNAL_ERROR",
          message: "요청을 처리하지 못했습니다.",
        });
      }
      const choice = (body as { choice: "a" | "b" }).choice;
      saved = {
        ...saved,
        assignments: saved.assignments.map((assignment) =>
          assignment.cardId === match[1]
            ? { ...assignment, visitorChoice: choice }
            : assignment,
        ),
      };
      return json(route, 200, saved);
    }
    return route.fallback();
  });

  return {
    calls,
    starts: () => starts,
    state: () => saved,
  };
}

async function chooseContext(page: Page) {
  await page.getByRole("radio", { name: "오래된 친구" }).check();
  await page.getByRole("radio", { name: "10년 이상이에요" }).check();
  await page.getByRole("button", { name: "3장 답하러 가기" }).click();
}

async function answerThree(page: Page) {
  await page.getByRole("button", { name: /^B / }).click();
  await page.getByRole("button", { name: /^A / }).click();
  await page.getByRole("button", { name: /^A / }).click();
}

test("public invite completes three cards, compares, copies, and reloads", async ({
  page,
}) => {
  await installClipboard(page);
  const api = await installVisitorApi(page);
  await page.goto(`/i/${publicId}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "이 사람과 어떤 사이인가요?" }),
  ).toBeFocused();
  await chooseContext(page);
  await expect(
    page.getByRole("heading", { name: assignments[0].visitorPrompt }),
  ).toBeVisible();
  await answerThree(page);
  await expect(page.getByText("3장 비교 완료")).toBeVisible();
  await expect(page.getByText("가장 다른 답", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "나도 이 팩으로 시작하기" }),
  ).toHaveAttribute("href", "/play/new?pack=old-friend&source=same_pack_cta");
  await page.getByRole("button", { name: "내 관리 링크 복사" }).click();
  await expect(
    page.getByRole("button", { name: "관리 링크 복사됨" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { __copied?: string }).__copied,
    ),
  ).toMatch(/\/responses\/manage#token=/);
  expect(api.starts()).toBe(1);

  await page.reload();
  await expect(page.getByText("3장 비교 완료")).toBeVisible();
  expect(api.starts()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("one-to-one invite uses the same flow and only its response resumes after consume", async ({
  page,
}) => {
  await installClipboard(page);
  const api = await installVisitorApi(page, { kind: "one_to_one" });
  await page.goto(`/i/${oneToOneId}#k=${secret}`);
  await expect(page.getByText("나에게 온 1:1 초대")).toBeVisible();
  await chooseContext(page);
  await answerThree(page);
  await expect(page.getByText("3장 비교 완료")).toBeVisible();
  await page.reload();
  await expect(page.getByText("3장 비교 완료")).toBeVisible();
  expect(api.state()?.status).toBe("submitted");
});

test("keeps context after rate limit and retries without a default", async ({
  page,
}) => {
  const api = await installVisitorApi(page, { rateLimitFirstStart: true });
  await page.goto(`/i/${publicId}#k=${secret}`);
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
  await page.getByRole("button", { name: "3장 답하러 가기" }).click();
  await expect(
    page.getByRole("heading", { name: assignments[0].visitorPrompt }),
  ).toBeVisible();
  expect(api.starts()).toBe(2);
});

test("retries the ordered save queue without losing later choices", async ({
  page,
}) => {
  await installClipboard(page);
  const api = await installVisitorApi(page, { failFirstSave: true });
  await page.goto(`/i/${publicId}#k=${secret}`);
  await chooseContext(page);
  await page.getByRole("button", { name: /^B / }).click();
  await expect(page.getByText("답변을 저장하지 못했어요.")).toBeVisible();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await page.getByRole("button", { name: /^A / }).click();
  await page.getByRole("button", { name: /^A / }).click();
  await expect(page.getByText("3장 비교 완료")).toBeVisible();
  expect(
    api.calls.filter(
      ({ pathname, method }) =>
        pathname.includes("/answers/") && method === "PUT",
    ),
  ).toHaveLength(4);
});

test("shows a readonly management fallback when clipboard is denied", async ({
  page,
}) => {
  await installClipboard(page, "failure");
  await installVisitorApi(page);
  await page.goto(`/i/${publicId}#k=${secret}`);
  await chooseContext(page);
  await answerThree(page);
  await page.getByRole("button", { name: "내 관리 링크 복사" }).click();
  const fallback = page.getByRole("textbox", { name: "직접 복사하기" });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveValue(/\/responses\/manage#token=/);
});

for (const width of [320, 390, 430]) {
  test(`keeps response controls usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installVisitorApi(page);
    await page.goto(`/i/${publicId}#k=${secret}`);
    const radios = page.getByRole("radio");
    expect(
      (await radios.first().locator("..").boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    await chooseContext(page);
    expect(
      (await page.getByRole("button", { name: /^B / }).boundingBox())?.height,
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
