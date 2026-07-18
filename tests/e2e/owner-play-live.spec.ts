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

function readShareActionEvents() {
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
        jsonb_agg(
          jsonb_build_object('event', event_name, 'properties', properties)
          order by event_name, occurred_at, id
        ),
        '[]'::jsonb
      )
      from public.analytics_events
      where event_name in ('share_handoff_succeeded', 'share_link_copied')`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output.trim()) as unknown;
}

function readRawShareCredentialLeakCount(rawSecret: string) {
  const sql = String.raw`\set raw_secret '${rawSecret}'
select (
  select count(*)
  from public.analytics_events
  where properties::text like '%' || :'raw_secret' || '%'
     or properties::text ~ '(#k=|https?://|channel|recipient)'
) + (
  select count(*)
  from public.share_links
  where to_jsonb(share_links)::text like '%' || :'raw_secret' || '%'
     or public_id like '%#%'
);`;
  const output = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      databaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { encoding: "utf8", input: sql },
  );
  return Number(output.trim());
}

async function postShareAction(
  page: import("@playwright/test").Page,
  playId: string,
  linkId: string,
) {
  return page.evaluate(
    async ({ playId, linkId }) => {
      const response = await fetch(`/api/me/plays/${playId}/share-events`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "share_link_copied", linkId }),
      });
      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        retryAfter: response.headers.get("retry-after"),
      };
    },
    { playId, linkId },
  );
}

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("live owner flow", () => {
  test.skip(!live, "GYEOP_E2E_LIVE=1 runs the local Supabase browser gate");
  test.describe.configure({ mode: "serial", retries: 0 });

  test.beforeAll(() => setOldFriendActive());
  test.afterAll(() => setOldFriendActive());

  test("keeps a Secure HttpOnly capability through save, reload, and completion", async ({
    browser,
    context,
    page,
  }) => {
    await context.addInitScript(() => {
      const state = { shareMode: "resolve" as "resolve" | "cancel" | "fail" };
      (
        window as typeof window & { __gyeopLiveHandoff: typeof state }
      ).__gyeopLiveHandoff = state;
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async () => {
          if (state.shareMode === "cancel") {
            throw new DOMException("cancelled", "AbortError");
          }
          if (state.shareMode === "fail") {
            throw new DOMException("failed", "NotAllowedError");
          }
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });
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
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();
    expect(
      /^http:\/\/127\.0\.0\.1:3000\/i\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/.test(
        inviteUrl,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "공유 메뉴로 링크를 전달했어요.",
    );

    await page.getByRole("radio", { name: /한 친구에게 1:1/ }).check();
    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    await page.getByRole("button", { name: "링크 복사" }).click();
    await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
    await expect
      .poll(() => readShareActionEvents())
      .toEqual([
        {
          event: "share_handoff_succeeded",
          properties: {
            packVersion: "old-friend-v1",
            linkKind: "public",
          },
        },
        {
          event: "share_link_copied",
          properties: {
            packVersion: "old-friend-v1",
            linkKind: "one_to_one",
          },
        },
      ]);
    expect(readRawShareCredentialLeakCount(rawSecretFrom(inviteUrl))).toBe(0);

    await page.evaluate(() => {
      (
        window as typeof window & {
          __gyeopLiveHandoff: { shareMode: "cancel" | "fail" | "resolve" };
        }
      ).__gyeopLiveHandoff.shareMode = "cancel";
    });
    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "공유를 취소했어요. 링크는 그대로 있어요.",
    );
    expect(readShareActionEvents()).toHaveLength(2);
    await page.evaluate(() => {
      (
        window as typeof window & {
          __gyeopLiveHandoff: { shareMode: "cancel" | "fail" | "resolve" };
        }
      ).__gyeopLiveHandoff.shareMode = "fail";
    });
    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(page.locator("aside").getByRole("alert")).toHaveText(
      "공유 메뉴를 열지 못했어요. 링크 복사를 사용해 주세요.",
    );
    expect(readShareActionEvents()).toHaveLength(2);
    await page.evaluate(() => {
      (
        window as typeof window & {
          __gyeopLiveHandoff: { shareMode: "cancel" | "fail" | "resolve" };
        }
      ).__gyeopLiveHandoff.shareMode = "resolve";
    });
    const rejectedExtraField = await page.evaluate(async () => {
      const playId = location.pathname.split("/").at(-1);
      const response = await fetch(`/api/me/plays/${playId}/share-events`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "share_link_copied",
          linkId: "19100000-0000-4000-8000-000000000099",
          inviteUrl: "https://example.invalid/deterministic-fixture",
        }),
      });
      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
      };
    });
    expect(rejectedExtraField).toEqual({
      status: 400,
      cacheControl: "private, no-store",
    });
    expect(readShareActionEvents()).toHaveLength(2);

    const ownerLinks = await page.evaluate(async (playId) => {
      const response = await fetch(`/api/me/plays/${playId}/links`, {
        credentials: "same-origin",
      });
      return (await response.json()) as {
        links: { id: string; kind: "public" | "one_to_one"; status: string }[];
      };
    }, ownerCookie!.value.split(".")[1]);
    const activeOneToOne = ownerLinks.links.find(
      (link) => link.kind === "one_to_one" && link.status === "active",
    );
    expect(Boolean(activeOneToOne)).toBe(true);

    const origin = new URL(page.url()).origin;
    const missingCookieContext = await browser.newContext();
    const missingCookiePage = await missingCookieContext.newPage();
    await missingCookiePage.goto(origin);
    expect(
      await postShareAction(
        missingCookiePage,
        ownerCookie!.value.split(".")[1],
        activeOneToOne!.id,
      ),
    ).toMatchObject({ status: 404, cacheControl: "private, no-store" });
    await missingCookieContext.close();

    const crossPlay = await postShareAction(
      page,
      "18181818-1818-4181-8181-181818181818",
      activeOneToOne!.id,
    );
    expect(crossPlay).toMatchObject({
      status: 404,
      cacheControl: "private, no-store",
    });

    const tamperedContext = await browser.newContext();
    await tamperedContext.addCookies([
      {
        ...ownerCookie!,
        value: `v1.${ownerCookie!.value.split(".")[1]}.${"A".repeat(43)}`,
      },
    ]);
    const tamperedPage = await tamperedContext.newPage();
    await tamperedPage.goto(origin);
    expect(
      await postShareAction(
        tamperedPage,
        ownerCookie!.value.split(".")[1],
        activeOneToOne!.id,
      ),
    ).toMatchObject({ status: 404, cacheControl: "private, no-store" });
    await tamperedContext.close();
    expect(readShareActionEvents()).toHaveLength(2);

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
        for (let request = 0; request < 121; request += 1) {
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
          if (response.status === 429) break;
        }
        return results;
      },
      { publicId, rawSecret },
    );
    expect(rateResults.length).toBeGreaterThan(60);
    expect(rateResults.at(-1)?.status).toBe(429);
    expect(
      rateResults.slice(0, -1).every((result) => result.status === 200),
    ).toBe(true);
    expect(Number(rateResults.at(-1)?.retryAfter)).toBeGreaterThan(0);
    await rateContext.close();

    await page.reload();
    await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);
    await expect(page.getByText("사용 중")).toHaveCount(2);

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("listitem")
      .filter({ hasText: "여러 친구" })
      .filter({ hasText: "사용 중" })
      .getByRole("button", { name: "새로 발급" })
      .click();
    const rotatedUrl = await page
      .getByLabel("공유 링크 직접 복사")
      .inputValue();
    expect(rotatedUrl !== inviteUrl).toBe(true);
    await page.getByRole("button", { name: "친구에게 공유하기" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "공유 메뉴로 링크를 전달했어요.",
    );
    await expect
      .poll(() => readShareActionEvents())
      .toEqual([
        {
          event: "share_handoff_succeeded",
          properties: {
            packVersion: "old-friend-v1",
            linkKind: "public",
          },
        },
        {
          event: "share_handoff_succeeded",
          properties: {
            packVersion: "old-friend-v1",
            linkKind: "public",
          },
        },
        {
          event: "share_link_copied",
          properties: {
            packVersion: "old-friend-v1",
            linkKind: "one_to_one",
          },
        },
      ]);
    expect(readRawShareCredentialLeakCount(rawSecretFrom(rotatedUrl))).toBe(0);

    await visitors[0].visitor.reload();
    await expect(
      visitors[0].visitor.getByRole("heading", {
        name: "이 초대는 지금 참여할 수 없어요",
      }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("listitem")
      .filter({ hasText: "여러 친구" })
      .filter({ hasText: "사용 중" })
      .getByRole("button", { name: "비활성화" })
      .click();
    await expect(page.getByLabel("공유 링크 직접 복사")).toHaveCount(0);

    const disabledPublic = await page.evaluate(async (playId) => {
      const response = await fetch(`/api/me/plays/${playId}/links`, {
        credentials: "same-origin",
      });
      const result = (await response.json()) as {
        links: { id: string; kind: "public"; status: string }[];
      };
      return result.links.find(
        (link) => link.kind === "public" && link.status === "disabled",
      )?.id;
    }, ownerCookie!.value.split(".")[1]);
    expect(Boolean(disabledPublic)).toBe(true);
    expect(
      await postShareAction(
        page,
        ownerCookie!.value.split(".")[1],
        disabledPublic!,
      ),
    ).toMatchObject({ status: 404, cacheControl: "private, no-store" });
    expect(readShareActionEvents()).toHaveLength(3);

    let limited:
      | {
          status: number;
          cacheControl: string | null;
          retryAfter: string | null;
        }
      | undefined;
    for (let request = 0; request < 121 && !limited; request += 1) {
      const response = await postShareAction(
        page,
        ownerCookie!.value.split(".")[1],
        disabledPublic!,
      );
      if (response.status === 429) limited = response;
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.retryAfter)).toBeGreaterThan(0);
    expect(readShareActionEvents()).toHaveLength(3);

    for (const { visitorContext } of visitors) await visitorContext.close();
  });
});

function rawSecretFrom(inviteUrl: string) {
  const url = new URL(inviteUrl);
  return new URLSearchParams(url.hash.slice(1)).get("k")!;
}
