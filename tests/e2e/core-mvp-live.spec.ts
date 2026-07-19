import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const live = process.env.GYEOP_E2E_LIVE === "1";
const databaseContainer = "supabase_db_gyeop";
const proxyKey = Buffer.alloc(32, 8).toString("base64url");
const coreFunnelKeys = [
  "owner_share:self_pack_completed",
  "owner_share:public_link_created",
  "owner_share:public_share_succeeded",
  "visitor_same_pack:visitor_required_submitted",
  "visitor_same_pack:comparison_viewed",
  "visitor_same_pack:same_pack_start_clicked",
  "visitor_same_pack:new_owner_pack_opened",
  "profile_reshare:profile_viewed",
  "profile_reshare:profile_reshare_clicked",
  "profile_reshare:profile_share_succeeded",
  "profile_reshare:downstream_visitor_submitted",
] as const;

type CoreFunnelKey = (typeof coreFunnelKeys)[number];
type VisitorFixture = {
  context: BrowserContext;
  page: Page;
};

const visitorHeaders = {
  "x-forwarded-host": "127.0.0.1",
  "x-forwarded-proto": "https",
  "x-forwarded-port": "443",
  "x-gyeop-origin-verify": proxyKey,
};

async function waitForLivePackApi() {
  const port = process.env.GYEOP_E2E_PORT ?? "3000";
  let lastStatus = "no response";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/packs/old-friend`,
        {
          headers: {
            ...visitorHeaders,
            "x-forwarded-for": "198.51.100.217",
          },
        },
      );
      lastStatus = `${response.status}`;
      if (response.status === 200) return;
    } catch (error: unknown) {
      lastStatus = error instanceof Error ? error.message : "unknown error";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Live pack API did not become ready: ${lastStatus}`);
}

function setOldFriendActive() {
  execFileSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "update public.pack_templates set is_active = true where slug = 'old-friend'",
    ],
    { stdio: "ignore" },
  );
}

function readCoreFunnelStageCounts() {
  const output = execFileSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-c",
      `select coalesce(
        jsonb_object_agg(funnel || ':' || stage, subjects),
        '{}'::jsonb
      )
      from private.core_funnel_stage_counts`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output.trim()) as Record<CoreFunnelKey, number>;
}

function coreFunnelDelta(initial: Record<CoreFunnelKey, number>) {
  const current = readCoreFunnelStageCounts();
  return Object.fromEntries(
    coreFunnelKeys.map((key) => [
      key,
      (current[key] ?? 0) - (initial[key] ?? 0),
    ]),
  );
}

async function installFailedClipboard(context: BrowserContext) {
  await context.addInitScript(() => {
    const state = { clipboard: "fail" as "fail" | "resolve" };
    (
      window as typeof window & {
        __gyeopMvpHandoff: typeof state;
      }
    ).__gyeopMvpHandoff = state;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          if (state.clipboard === "fail") throw new Error("clipboard failed");
        },
      },
    });
  });
}

async function allowClipboard(page: Page) {
  await page.evaluate(() => {
    (
      window as typeof window & {
        __gyeopMvpHandoff: { clipboard: "fail" | "resolve" };
      }
    ).__gyeopMvpHandoff.clipboard = "resolve";
  });
}

async function expectNoHighImpactA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations
      .filter(({ impact }) => impact === "critical" || impact === "serious")
      .map(({ id, impact }) => ({ id, impact })),
  ).toEqual([]);
}

async function expectNoMotionTransition(target: Locator) {
  expect(
    await target.evaluate((element) =>
      getComputedStyle(element)
        .transitionDuration.split(",")
        .every((duration) => duration.trim() === "0s"),
    ),
  ).toBe(true);
}

async function expectMobileContract(page: Page, primary: Locator) {
  await expect(primary).toBeVisible();
  await primary.scrollIntoViewIfNeeded();
  const contract = await primary.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      targetWidth: rect.width,
      targetHeight: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(contract.horizontalOverflow).toBe(false);
  expect(contract.reducedMotion).toBe(true);
  expect(contract.targetWidth).toBeGreaterThanOrEqual(44);
  expect(contract.targetHeight).toBeGreaterThanOrEqual(44);
  expect(contract.left).toBeGreaterThanOrEqual(0);
  expect(contract.right).toBeLessThanOrEqual(contract.viewportWidth + 0.5);
  expect(contract.top).toBeGreaterThanOrEqual(0);
  expect(contract.bottom).toBeLessThanOrEqual(contract.viewportHeight + 0.5);
}

async function waitForOwnerPlayStart(page: Page) {
  const playUrl = /\/play\/[0-9a-f-]{36}$/;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const retry = page.getByRole("button", { name: "다시 시도" });
    const outcome = await Promise.race([
      page
        .waitForURL(playUrl, { timeout: 15_000 })
        .then(() => "started" as const),
      retry
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "retry" as const),
    ]);
    if (outcome === "started") return;
    if (attempt === 5) {
      throw new Error("Owner play did not start after five explicit retries");
    }
    await page.waitForTimeout(250 * (attempt + 1));
    await retry.click();
    await expect(retry).toBeHidden();
  }
}

async function completeOwner(page: Page) {
  await page.goto("/play/new?pack=old-friend");
  await waitForOwnerPlayStart(page);
  await expect(
    page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
  ).toBeFocused();
  const choice = page.locator('button[data-choice="a"]');
  await expectMobileContract(page, choice);
  await expectNoMotionTransition(page.getByTestId("question-card"));
  await expectNoHighImpactA11yViolations(page);

  for (let position = 1; position <= 10; position += 1) {
    await page.locator('button[data-choice="a"]').click();
  }
  await expect(
    page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "친구에게 공유하기" }).click();
  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  await expectNoHighImpactA11yViolations(page);
}

async function completeVisitor(
  browser: Browser,
  inviteUrl: string,
  input: {
    ip: string;
    viewport: { width: number; height: number };
    relationship: string;
    knownSince: string;
  },
): Promise<VisitorFixture> {
  const context = await browser.newContext({
    viewport: input.viewport,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
    extraHTTPHeaders: {
      ...visitorHeaders,
      "x-forwarded-for": input.ip,
    },
  });
  const page = await context.newPage();
  await page.goto(inviteUrl);
  await expect(
    page.getByRole("heading", { name: "이 사람과 어떤 사이인가요?" }),
  ).toBeFocused();
  await page
    .getByRole("radio", { name: input.relationship, exact: true })
    .check();
  await page
    .getByRole("radio", { name: input.knownSince, exact: true })
    .check();
  const start = page.getByRole("button", { name: "3장 답하러 가기" });
  await expectMobileContract(page, start);
  await expectNoHighImpactA11yViolations(page);
  await start.click();

  const question = page.getByRole("heading", { level: 1 });
  await expect(question).toBeFocused();
  await expectNoMotionTransition(
    page.locator(
      'section[data-kind="response"] [role="progressbar"] + div span',
    ),
  );
  for (const [index, choice] of ["B", "A", "A"].entries()) {
    const prompt = await question.textContent();
    await page.getByRole("button", { name: new RegExp(`^${choice} `) }).click();
    if (index < 2) await expect(question).not.toHaveText(prompt ?? "");
  }
  await expect(page.getByText("3장 비교 완료")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.locator('section[data-kind="comparison"] h1'),
  ).toBeFocused();
  const samePack = page.getByRole("link", {
    name: "나도 이 팩으로 시작하기",
  });
  await expectMobileContract(page, samePack);
  await expectNoHighImpactA11yViolations(page);
  return { context, page };
}

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("core MVP live gate", () => {
  test.skip(!live, "GYEOP_E2E_LIVE=1 runs the core MVP browser gate");
  test.describe.configure({ mode: "serial", retries: 0 });

  test.beforeAll(async () => {
    setOldFriendActive();
    await waitForLivePackApi();
  });
  test.afterAll(() => setOldFriendActive());

  test("proves owner share, visitor conversion, and profile reshare", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(180_000);
    const initialFunnel = readCoreFunnelStageCounts();
    const visitors: VisitorFixture[] = [];

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFailedClipboard(context);
    await completeOwner(page);

    const createLink = page.getByRole("button", {
      name: "공유 링크 만들기",
    });
    await expectMobileContract(page, createLink);
    await createLink.click();
    const manualUrl = page.getByLabel("공유 링크 직접 복사");
    const inviteUrl = await manualUrl.inputValue();
    expect(
      /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/i\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/.test(
        inviteUrl,
      ),
    ).toBe(true);

    const copy = page.getByRole("button", { name: "링크 복사" });
    await copy.click();
    await expect(page.locator("aside").getByRole("alert")).toContainText(
      "자동 복사가 안 됐어요",
    );
    await expect(manualUrl).toBeFocused();
    expect(
      await manualUrl.evaluate((input) => ({
        start: (input as HTMLInputElement).selectionStart,
        end: (input as HTMLInputElement).selectionEnd,
        length: (input as HTMLInputElement).value.length,
      })),
    ).toEqual({ start: 0, end: inviteUrl.length, length: inviteUrl.length });
    await expect
      .poll(() => {
        const delta = coreFunnelDelta(initialFunnel);
        return {
          created: delta["owner_share:public_link_created"],
          succeeded: delta["owner_share:public_share_succeeded"],
        };
      })
      .toEqual({ created: 1, succeeded: 0 });

    await allowClipboard(page);
    await copy.click();
    await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
    await expectMobileContract(page, copy);

    const visitorInputs = [
      {
        ip: "198.51.100.230",
        viewport: { width: 320, height: 800 },
        relationship: "오래된 친구",
        knownSince: "10년 이상이에요",
      },
      {
        ip: "198.51.100.231",
        viewport: { width: 390, height: 844 },
        relationship: "가족",
        knownSince: "1년 이상 · 3년 미만",
      },
      {
        ip: "198.51.100.232",
        viewport: { width: 430, height: 932 },
        relationship: "학교 친구",
        knownSince: "1년 미만이에요",
      },
    ] as const;

    visitors.push(
      await completeVisitor(browser, inviteUrl, visitorInputs[0]),
      await completeVisitor(browser, inviteUrl, visitorInputs[1]),
    );

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/me");
    await expect(
      page.getByRole("heading", { name: "내 시선 프로필" }),
    ).toBeFocused();
    await expect(page.getByLabel("친구 시선 3개")).toHaveCount(0);
    await expect(page.getByText(/시선을 모으는 중 · [0-2]\/3/)).toHaveCount(10);
    const collectMore = page.getByRole("link", { name: "시선 더 모으기" });
    await expectMobileContract(page, collectMore);
    await expectNoHighImpactA11yViolations(page);

    visitors.push(await completeVisitor(browser, inviteUrl, visitorInputs[2]));

    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/me");
    const signatureHeading = page.getByRole("heading", {
      name: "서운한 일이 생기면 나는?",
    });
    const signatureCard = page.locator("article").filter({
      has: signatureHeading,
    });
    const signatureAggregate = signatureCard.getByLabel("친구 시선 3개");
    await expect(signatureAggregate).toHaveCount(1);
    await expect(
      signatureAggregate.getByText("A · 바로 이야기한다"),
    ).toBeVisible();
    await expect(signatureAggregate.getByText("0명")).toBeVisible();
    await expect(
      signatureAggregate.getByText("B · 생각을 정리한 뒤 말한다"),
    ).toBeVisible();
    await expect(signatureAggregate.getByText("3명")).toBeVisible();
    const lockedCards = page.locator("article").filter({
      hasNot: signatureHeading,
    });
    await expect(lockedCards).toHaveCount(9);
    await expect(
      lockedCards.getByText(/시선을 모으는 중 · [0-2]\/3/),
    ).toHaveCount(9);
    await expect(lockedCards.getByLabel("친구 시선 3개")).toHaveCount(0);
    await expectMobileContract(page, collectMore);
    await expectNoHighImpactA11yViolations(page);

    const samePack = visitors[0].page.getByRole("link", {
      name: "나도 이 팩으로 시작하기",
    });
    await samePack.focus();
    await visitors[0].page.keyboard.press("Enter");
    await visitors[0].page.waitForURL(/\/play\/[0-9a-f-]{36}$/);
    await expect(
      visitors[0].page.getByRole("heading", {
        name: "서운한 일이 생기면 나는?",
      }),
    ).toBeVisible();

    await collectMore.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      /\/me\/plays\/[0-9a-f-]{36}\?entry_source=profile_reshare$/,
    );
    await expect(
      page.getByRole("heading", { name: "공유 링크" }),
    ).toBeFocused();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("listitem")
      .filter({ hasText: "여러 친구" })
      .filter({ hasText: "사용 중" })
      .getByRole("button", { name: "새로 발급" })
      .click();
    const replacementUrl = await page
      .getByLabel("공유 링크 직접 복사")
      .inputValue();
    expect(replacementUrl !== inviteUrl).toBe(true);
    await allowClipboard(page);
    const profileCopy = page.getByRole("button", { name: "링크 복사" });
    await profileCopy.click();
    await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
    await expectMobileContract(page, profileCopy);
    await expectNoHighImpactA11yViolations(page);

    visitors.push(
      await completeVisitor(browser, replacementUrl, {
        ip: "198.51.100.233",
        viewport: { width: 390, height: 844 },
        relationship: "온라인 친구",
        knownSince: "잘 모르겠어요",
      }),
    );

    await expect
      .poll(() => coreFunnelDelta(initialFunnel))
      .toEqual({
        "owner_share:self_pack_completed": 1,
        "owner_share:public_link_created": 1,
        "owner_share:public_share_succeeded": 1,
        "visitor_same_pack:visitor_required_submitted": 4,
        "visitor_same_pack:comparison_viewed": 4,
        "visitor_same_pack:same_pack_start_clicked": 1,
        "visitor_same_pack:new_owner_pack_opened": 1,
        "profile_reshare:profile_viewed": 1,
        "profile_reshare:profile_reshare_clicked": 1,
        "profile_reshare:profile_share_succeeded": 1,
        "profile_reshare:downstream_visitor_submitted": 1,
      });

    for (const visitor of visitors) await visitor.context.close();
  });

  test("completes a newly added pack through the real browser path", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFailedClipboard(context);
    await page.goto("/");

    const packCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: "나, 첫눈에 어땠어?" }),
    });
    await packCard.getByRole("link", { name: "질문 시작하기" }).click();
    await waitForOwnerPlayStart(page);
    await expect(
      page.getByRole("heading", { name: "처음 만난 자리에서 나는?" }),
    ).toBeFocused();

    for (let position = 1; position <= 10; position += 1) {
      await page.locator('button[data-choice="a"]').click();
    }
    await expect(
      page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(page.getByText("겹 · 나, 첫눈에 어땠어?")).toBeVisible();

    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();
    expect(inviteUrl).toContain("/i/");

    const visitor = await completeVisitor(browser, inviteUrl, {
      ip: "198.51.100.240",
      viewport: { width: 390, height: 844 },
      relationship: "오래된 친구",
      knownSince: "10년 이상이에요",
    });
    await expect(
      visitor.page.getByText("겹 · 나, 첫눈에 어땠어?"),
    ).toBeVisible();
    const samePack = visitor.page.getByRole("link", {
      name: "나도 이 팩으로 시작하기",
    });
    await samePack.click();
    await waitForOwnerPlayStart(visitor.page);
    await expect(
      visitor.page.getByRole("heading", {
        name: "처음 만난 자리에서 나는?",
      }),
    ).toBeFocused();

    await page.goto("/me");
    await expect(page.getByText("겹 · 나, 첫눈에 어땠어?")).toBeVisible();
    await expect(page.locator("article")).toHaveCount(10);
    await visitor.context.close();
  });
});
