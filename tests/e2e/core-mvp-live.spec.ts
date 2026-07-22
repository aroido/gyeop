import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { hashVisitorManagementSecret } from "../../lib/visitor-response/visitor-session-core.mjs";
import {
  claimCompletedOwner,
  claimCompletedOwnerAccount,
  signInOwnerAccount,
} from "./owner-auth-live-fixture";

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
  for (let attempt = 0; attempt < 180; attempt += 1) {
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
    await new Promise((resolve) => setTimeout(resolve, 500));
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

function sql(query: string) {
  return execFileSync(
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
      "-At",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
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

async function completeOwnerAccount(page: Page) {
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
  const account = await claimCompletedOwnerAccount(page);
  await expectNoHighImpactA11yViolations(page);
  return account;
}

async function completeOwner(page: Page) {
  return (await completeOwnerAccount(page)).playId;
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
    const ownerAccount = await completeOwnerAccount(page);
    const ownerPlayId = ownerAccount.playId;

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
    await page.goto(`/me/profile/${ownerPlayId}`);
    await expect(
      page.getByRole("heading", { name: "내 시선 프로필" }),
    ).toBeFocused();
    await expect(page.getByLabel("친구 시선 3개")).toHaveCount(0);
    await expect(page.getByText(/시선을 모으는 중 · [0-2]\/3/)).toHaveCount(10);
    const collectMore = page.getByRole("link", { name: "시선 더 모으기" });
    await expectMobileContract(page, collectMore);
    await expectNoHighImpactA11yViolations(page);

    visitors.push(await completeVisitor(browser, inviteUrl, visitorInputs[2]));

    const accountContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
      extraHTTPHeaders: {
        ...visitorHeaders,
        "x-forwarded-for": "198.51.100.234",
      },
    });
    const accountPage = await accountContext.newPage();
    await signInOwnerAccount(accountPage, ownerAccount.email);
    expect(
      (await accountContext.cookies()).some(
        (cookie) => cookie.name === "__Host-gyeop-owner",
      ),
    ).toBe(false);
    await expect(
      accountPage.getByRole("heading", {
        name: "우리는 아직도 통하는 편",
        level: 2,
      }),
    ).toBeVisible();
    await accountPage.getByRole("link", { name: "프로필·공유 관리" }).click();
    await expect(accountPage).toHaveURL(`/me/plays/${ownerPlayId}`);
    await expect(
      accountPage.getByRole("heading", { name: "공유 링크" }),
    ).toBeFocused();
    await expect(accountPage.getByText("사용 중")).toHaveCount(1);
    await accountPage.goto(`/me/profile/${ownerPlayId}`);
    await expect(
      accountPage.getByRole("heading", { name: "내 시선 프로필" }),
    ).toBeFocused();
    await expect(
      accountPage.getByText("공개 링크로 도착한 시선"),
    ).toBeVisible();
    await accountContext.close();

    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto(`/me/profile/${ownerPlayId}`);
    const signatureHeading = page.getByRole("heading", {
      name: "오랜만에 친구를 만나면 나는?",
    });
    const signatureCard = page.locator("article").filter({
      has: signatureHeading,
    });
    const signatureAggregate = signatureCard.getByLabel("친구 시선 3개");
    await expect(signatureAggregate).toHaveCount(1);
    await expect(
      signatureAggregate.getByText("A · 어제 본 듯 바로 편해진다"),
    ).toBeVisible();
    await expect(signatureAggregate.getByText("0명")).toBeVisible();
    await expect(
      signatureAggregate.getByText("B · 근황부터 천천히 맞춰 간다"),
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
      has: page.getByRole("heading", { name: "첫 장면, 네 버전" }),
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
    const ownerPlayId = await claimCompletedOwner(page);
    await expect(page.getByText("겹 · 첫 장면, 네 버전")).toBeVisible();

    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();
    expect(inviteUrl.includes("/i/")).toBe(true);

    const visitor = await completeVisitor(browser, inviteUrl, {
      ip: "198.51.100.240",
      viewport: { width: 390, height: 844 },
      relationship: "오래된 친구",
      knownSince: "10년 이상이에요",
    });
    await expect(visitor.page.getByText("겹 · 첫 장면, 네 버전")).toBeVisible();
    await visitor.page.getByRole("button", { name: "2장 더 답하기" }).click();
    await expect(
      visitor.page.getByRole("progressbar", { name: "추가 답변 진행" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await visitor.page.getByRole("button", { name: /^B / }).click();
    await visitor.page.reload();
    await expect(
      visitor.page.getByRole("progressbar", { name: "추가 답변 진행" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await visitor.page.getByRole("button", { name: /^A / }).click();
    await expect(visitor.page.getByText("2장 추가 비교 완료")).toBeVisible();
    await expect(visitor.page.getByText("추가 1번째 질문")).toBeVisible();
    await expect(visitor.page.getByText("추가 2번째 질문")).toBeVisible();
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
    await expect(
      page.getByRole("heading", { name: "저장한 질문팩" }),
    ).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "첫 장면, 네 버전", level: 2 }),
    ).toBeVisible();
    await page.goto(`/me/profile/${ownerPlayId}`);
    await expect(page.locator("article")).toHaveCount(10);
    await visitor.context.close();
  });

  test("withdraws a visitor response through its copied management link", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFailedClipboard(context);
    const ownerPlayId = await completeOwner(page);
    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();

    const visitor = await completeVisitor(browser, inviteUrl, {
      ip: "198.51.100.241",
      viewport: { width: 390, height: 844 },
      relationship: "가족",
      knownSince: "1년 이상 · 3년 미만",
    });
    await visitor.page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("clipboard failed");
          },
        },
      });
    });
    const responseId = await visitor.page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith("gyeop:visitor-management:v1:"),
      );
      return key?.slice("gyeop:visitor-management:v1:".length) ?? null;
    });
    expect(responseId).toMatch(/^[0-9a-f-]{36}$/);
    await visitor.page
      .getByRole("button", { name: "내 관리 링크 복사" })
      .click();
    const managementUrl = await visitor.page
      .getByRole("textbox", { name: "직접 복사하기" })
      .inputValue();
    expect(managementUrl).toMatch(/\/responses\/manage#token=/);

    await page.goto(`/me/profile/${ownerPlayId}`);
    await expect(page.getByText("시선을 모으는 중 · 1/3")).toHaveCount(3);

    await visitor.page.goto(managementUrl);
    await expect(
      visitor.page.getByRole("heading", { name: "이 답변을 지울까요?" }),
    ).toBeVisible();
    expect(visitor.page.url()).not.toContain("#token=");
    await visitor.page
      .getByRole("button", { name: "이 답변 철회하기" })
      .click();
    await expect(
      visitor.page.getByRole("heading", { name: "답변을 철회했어요" }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText("시선을 모으는 중 · 0/3")).toHaveCount(10);

    const oldSession = await visitor.context.request.get(
      `/api/responses/${responseId}`,
    );
    expect(oldSession.status()).toBe(404);
    expect((await oldSession.json()).code).toBe("INVITE_UNAVAILABLE");

    await visitor.page.goto(managementUrl);
    await visitor.page
      .getByRole("button", { name: "이 답변 철회하기" })
      .click();
    await expect(
      visitor.page.getByRole("heading", {
        name: "이 관리 링크는 사용할 수 없어요",
      }),
    ).toBeVisible();
    await visitor.context.close();
  });

  test("keeps one-to-one comparison private to its owner and visitor", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installFailedClipboard(context);
    await completeOwner(page);
    const sharePageUrl = page.url();

    await page.getByRole("radio", { name: "한 친구에게 1:1" }).check();
    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();
    const visitor = await completeVisitor(browser, inviteUrl, {
      ip: "198.51.100.242",
      viewport: { width: 390, height: 844 },
      relationship: "오래된 친구",
      knownSince: "10년 이상이에요",
    });
    const responseId = await visitor.page.evaluate(() => {
      const prefix = "gyeop:visitor-management:v1:";
      return Object.keys(localStorage)
        .find((candidate) => candidate.startsWith(prefix))
        ?.slice(prefix.length);
    });
    expect(responseId).toMatch(/^[0-9a-f-]{36}$/);

    await page.goto(sharePageUrl);
    await expect(
      page.getByRole("heading", { name: "1:1로 본 우리" }),
    ).toBeVisible();
    await expect(page.getByText("오래된 친구 · 10년 이상이에요")).toBeVisible();
    await page.getByRole("button", { name: "비교 보기" }).click();
    await expect(
      page.getByRole("heading", { name: "둘만 보는 1:1 비교" }),
    ).toBeFocused();
    await expect(page.getByText("내 실제 답")).toHaveCount(3);
    await expect(page.getByText("친구가 본 나")).toHaveCount(3);
    await expectNoHighImpactA11yViolations(page);

    sql(`
      with fixed_time as (select clock_timestamp() as value)
      update public.visitor_responses
      set created_at = fixed_time.value - interval '48 hours',
          session_expires_at = fixed_time.value - interval '24 hours'
      from fixed_time
      where id = '${responseId}'
    `);
    await visitor.page.reload();
    await expect(
      visitor.page.getByRole("heading", {
        name: "이 초대는 지금 참여할 수 없어요",
      }),
    ).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "비교 보기" }).click();
    await expect(page.getByText("내 실제 답")).toHaveCount(3);

    expect(
      sql(`
        select public.withdraw_response(
          (select management_token_hash from public.visitor_responses where id = '${responseId}')
        )->>'outcome'
      `),
    ).toBe("withdrawn");
    await page.reload();
    await expect(page.getByText("철회된 1:1 답변")).toBeVisible();
    await expect(page.getByText("비교 내용은 남아 있지 않아요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "비교 보기" })).toHaveCount(
      0,
    );
    expect(
      sql(`
        select status || ':' || (consumed_response_id = '${responseId}')::text
        from public.share_links
        where consumed_response_id = '${responseId}'
      `),
    ).toBe("disabled:true");
    await visitor.context.close();
  });

  test("rate limits before resolving a valid withdrawal capability", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const playId = randomUUID();
    const linkId = randomUUID();
    const responseId = randomUUID();
    const publicId = randomBytes(16).toString("base64url");
    const ownerHash = randomBytes(32).toString("hex");
    const shareHash = randomBytes(32).toString("hex");
    const sessionHash = randomBytes(32).toString("hex");
    const managementToken = randomBytes(32).toString("base64url");
    const managementHash =
      hashVisitorManagementSecret(managementToken).toString("hex");
    const wrongTokens = Array.from({ length: 5 }, () =>
      randomBytes(32).toString("base64url"),
    );

    sql(`
      delete from public.rate_limit_buckets
      where action = 'response_withdraw';
      with fixed_time as (select clock_timestamp() as value)
      insert into public.pack_plays (
        id, pack_version_id, management_secret_hash, management_expires_at,
        last_active_at, status, current_position, completed_at
      ) select '${playId}', '15151515-1515-4515-8515-151515151515',
        decode('${ownerHash}', 'hex'), value + interval '7 days', value,
        'completed', 10, value
      from fixed_time;
      insert into public.share_links (
        id, public_id, pack_play_id, kind, secret_hash
      ) values (
        '${linkId}', '${publicId}', '${playId}', 'public',
        decode('${shareHash}', 'hex')
      );
      with fixed_time as (select clock_timestamp() as value)
      insert into public.visitor_responses (
        id, share_link_id, pack_version_id, relationship_code,
        known_since_code, status, session_token_hash, session_expires_at,
        management_token_hash, created_at, submitted_at
      ) select '${responseId}', '${linkId}',
        '15151515-1515-4515-8515-151515151515', 'old_friend',
        'ten_years_or_more', 'submitted', decode('${sessionHash}', 'hex'),
        value + interval '24 hours', decode('${managementHash}', 'hex'),
        value, value
      from fixed_time;
    `);

    await page.goto("/");
    const outcomes = await page.evaluate(async (tokens) => {
      const values = [];
      for (const token of tokens) {
        const response = await fetch("/api/responses/withdraw", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        values.push({
          status: response.status,
          code: (await response.json()).code as string,
        });
      }
      return values;
    }, wrongTokens);
    expect(outcomes).toEqual(
      wrongTokens.map(() => ({
        status: 404,
        code: "RESPONSE_MANAGEMENT_UNAVAILABLE",
      })),
    );

    const limited = await page.evaluate(async (token) => {
      const response = await fetch("/api/responses/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return {
        status: response.status,
        code: (await response.json()).code as string,
        retryAfter: response.headers.get("retry-after"),
      };
    }, managementToken);
    expect(limited.status).toBe(429);
    expect(limited.code).toBe("RATE_LIMITED");
    expect(limited.retryAfter).toMatch(/^[1-9][0-9]*$/);
    expect(
      sql(`
        select status || ':' || (management_token_hash is not null)::text
        from public.visitor_responses
        where id = '${responseId}'
      `),
    ).toBe("submitted:true");

    sql(`
      delete from public.rate_limit_buckets
      where action = 'response_withdraw'
    `);
    const withdrawn = await page.evaluate(async (token) => {
      const response = await fetch("/api/responses/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return response.status;
    }, managementToken);
    expect(withdrawn).toBe(204);
  });
});
