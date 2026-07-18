import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const live = process.env.GYEOP_E2E_LIVE === "1";
const databaseContainer = "supabase_db_gyeop";
const proxyKey = Buffer.alloc(32, 8).toString("base64url");
const visitorHeaders = {
  "x-forwarded-for": "198.51.100.219",
  "x-forwarded-host": "127.0.0.1",
  "x-forwarded-proto": "https",
  "x-forwarded-port": "443",
  "x-gyeop-origin-verify": proxyKey,
};

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

test.describe("live owner flow", () => {
  test.skip(!live, "GYEOP_E2E_LIVE=1 runs the local Supabase browser gate");
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => setOldFriendActive());
  test.afterAll(() => setOldFriendActive());

  test("keeps a Secure HttpOnly capability through save, reload, and completion", async ({
    browser,
    context,
    page,
  }) => {
    await page.goto("/play/new?pack=old-friend");
    await page.waitForURL(/\/play\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { name: "서운한 일이 생기면 나는?" }),
    ).toBeVisible();

    const ownerCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "__Host-gyeop-owner",
    );
    expect(ownerCookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(ownerCookie?.value).toMatch(
      /^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/,
    );

    await page.locator('button[data-choice="a"]').click();
    await expect(page.locator('[data-state="saved"]')).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "오랜만에 친구를 만나면 나는?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "이전" }).click();
    await expect(page.locator('button[data-choice="a"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator('button[data-choice="a"]').click();

    for (let position = 2; position <= 10; position += 1) {
      await page.locator('button[data-choice="a"]').click();
    }
    await expect(
      page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
    ).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "내 답변 10개가 저장됐어요" }),
    ).toBeVisible();
    await expect(page.locator("[data-choice]")).toHaveCount(0);

    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(
      page.getByRole("heading", { name: "공유 링크" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.locator("code").innerText();
    expect(inviteUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:3000\/i\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/,
    );

    const visitors = await Promise.all(
      ["198.51.100.220", "198.51.100.221"].map(async (ip) => {
        const visitorContext = await browser.newContext({
          extraHTTPHeaders: { ...visitorHeaders, "x-forwarded-for": ip },
        });
        const visitor = await visitorContext.newPage();
        await visitor.goto(inviteUrl);
        await expect(
          visitor.getByRole("heading", {
            name: "친구가 먼저 답한 질문팩이에요",
          }),
        ).toBeVisible();
        return { visitor, visitorContext };
      }),
    );

    const rateContext = await browser.newContext({
      extraHTTPHeaders: {
        ...visitorHeaders,
        "x-forwarded-for": "198.51.100.222",
      },
    });
    const ratePage = await rateContext.newPage();
    await ratePage.goto("/");
    const invite = new URL(inviteUrl);
    const publicId = invite.pathname.split("/").at(-1)!;
    const rawSecret = new URLSearchParams(invite.hash.slice(1)).get("k")!;
    const rateResults = await ratePage.evaluate(
      async ({ publicId, rawSecret }) => {
        const results: { status: number; retryAfter: string | null }[] = [];
        for (let request = 0; request < 61; request += 1) {
          const response = await fetch(`/api/invites/${publicId}/metadata`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ secret: rawSecret }),
          });
          results.push({
            status: response.status,
            retryAfter: response.headers.get("retry-after"),
          });
        }
        return results;
      },
      { publicId, rawSecret },
    );
    expect(
      rateResults.slice(0, 60).every((result) => result.status === 200),
    ).toBe(true);
    expect(rateResults[60].status).toBe(429);
    expect(Number(rateResults[60].retryAfter)).toBeGreaterThan(0);
    await rateContext.close();

    await page.reload();
    await expect(page.locator("code")).toHaveCount(0);
    await expect(page.getByText("사용 중")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "새로 발급" }).click();
    const rotatedUrl = await page.locator("code").innerText();
    expect(rotatedUrl).not.toBe(inviteUrl);

    await visitors[0].visitor.reload();
    await expect(
      visitors[0].visitor.getByRole("heading", {
        name: "이 초대는 지금 참여할 수 없어요",
      }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "비활성화" }).click();
    await expect(page.locator("code")).toHaveCount(0);

    for (const { visitorContext } of visitors) await visitorContext.close();
  });
});
