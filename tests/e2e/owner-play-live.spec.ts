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

function readVisitorResponseSummary(publicId: string) {
  const sql = String.raw`\set public_id '${publicId}'
select jsonb_build_object(
  'responses', (
    select count(*)
    from public.visitor_responses response
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
  ),
  'sessionHashes', (
    select count(distinct encode(response.session_token_hash, 'hex'))
    from public.visitor_responses response
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
  ),
  'assignments', (
    select count(*)
    from public.visitor_assignments assignment
    join public.visitor_responses response on response.id = assignment.response_id
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
  ),
  'signatureAssignments', (
    select count(*)
    from public.visitor_assignments assignment
    join public.visitor_responses response on response.id = assignment.response_id
    join public.share_links link on link.id = response.share_link_id
    join public.pack_cards card
      on card.pack_version_id = assignment.pack_version_id
      and card.id = assignment.card_id
    where link.public_id = :'public_id'
      and card.is_signature
  ),
  'contexts', (
    select jsonb_agg(
      jsonb_build_object(
        'relationship', response.relationship_code,
        'knownSince', response.known_since_code,
        'status', response.status,
        'fixedTtl', response.session_expires_at - response.created_at = interval '24 hours'
      ) order by response.relationship_code
    )
    from public.visitor_responses response
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
  ),
  'events', (
    select jsonb_object_agg(event_name, event_count)
    from (
      select event.event_name, count(*) as event_count
      from public.analytics_events event
      join public.visitor_responses response on response.id = event.visitor_response_id
      join public.share_links link on link.id = response.share_link_id
      where link.public_id = :'public_id'
      group by event.event_name
    ) counted
  )
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
  return JSON.parse(output.trim()) as unknown;
}

function readVisitorResponseCounts(publicId: string) {
  const sql = String.raw`\set public_id '${publicId}'
select jsonb_build_object(
  'responses', (
    select count(*)
    from public.visitor_responses response
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
  ),
  'relationshipEvents', (
    select count(*)
    from public.analytics_events event
    join public.visitor_responses response on response.id = event.visitor_response_id
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
      and event.event_name = 'relationship_selected'
  ),
  'startedEvents', (
    select count(*)
    from public.analytics_events event
    join public.visitor_responses response on response.id = event.visitor_response_id
    join public.share_links link on link.id = response.share_link_id
    where link.public_id = :'public_id'
      and event.event_name = 'visitor_response_started'
  ),
  'maxBucket', (
    select max(count)
    from public.rate_limit_buckets
    where action = 'response_start'
  )
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
  return JSON.parse(output.trim()) as unknown;
}

function expireVisitorResponse(responseId: string) {
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
      `with fixed_time as (select clock_timestamp() as value)
       update public.visitor_responses
       set created_at = fixed_time.value - interval '25 hours',
           session_expires_at = fixed_time.value - interval '1 hour'
       from fixed_time
       where id = '${responseId}'::uuid`,
    ],
    { stdio: "ignore" },
  );
}

function setVisitorLinkStatus(publicId: string, status: "active" | "disabled") {
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
      `update public.share_links
       set status = '${status}', updated_at = clock_timestamp()
       where public_id = '${publicId}'`,
    ],
    { stdio: "ignore" },
  );
}

async function postRawVisitorResponse(input: {
  publicId: string;
  secret: string;
  body?:
    | { intent: "resume"; secret: string }
    | {
        intent: "start";
        secret: string;
        relationshipCode: string;
        knownSinceCode: string;
      };
  cookie?: string;
  ip?: string;
}) {
  const headers: Record<string, string> = {
    ...visitorHeaders,
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
  };
  if (input.ip) headers["x-forwarded-for"] = input.ip;
  if (input.cookie) headers.cookie = input.cookie;
  const response = await fetch(
    `http://127.0.0.1:3000/api/invites/${input.publicId}/responses`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        input.body ?? { intent: "resume", secret: input.secret },
      ),
    },
  );
  const setCookie = response.headers.get("set-cookie");
  const sessionCookie = setCookie?.match(
    /^__Host-gyeop-response=([^;]+);/,
  )?.[1];
  return {
    fingerprint: {
      status: response.status,
      body: await response.text(),
      cacheControl: response.headers.get("cache-control"),
      contentSecurityPolicy: response.headers.get("content-security-policy"),
      strictTransportSecurity: response.headers.get(
        "strict-transport-security",
      ),
      referrerPolicy: response.headers.get("referrer-policy"),
      contentTypeOptions: response.headers.get("x-content-type-options"),
    },
    deletesCookie: setCookie?.startsWith("__Host-gyeop-response=;") ?? false,
    setsSessionCookie:
      setCookie?.startsWith("__Host-gyeop-response=v1.") ?? false,
    sessionCookie: sessionCookie ?? null,
    retryAfter: response.headers.get("retry-after"),
  };
}

function expectExactAssignmentResponse(body: string) {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  const forbiddenKeys: string[] = [];
  const scanKeys = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(scanKeys);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        /owner|self|sample|packVersionId|playId|linkId|hash|token/i.test(key)
      ) {
        forbiddenKeys.push(key);
      }
      scanKeys(child);
    }
  };
  scanKeys(parsed);
  expect(forbiddenKeys).toEqual([]);
  expect(Object.keys(parsed).sort()).toEqual([
    "assignments",
    "id",
    "knownSinceCode",
    "knownSinceLabel",
    "relationshipCode",
    "relationshipLabel",
    "sessionExpiresAt",
    "sessionTtlSeconds",
    "status",
  ]);
  const assignments = parsed.assignments as Record<string, unknown>[];
  expect(assignments).toHaveLength(3);
  expect(assignments.map((assignment) => assignment.position)).toEqual([
    1, 2, 3,
  ]);
  expect(assignments.map((assignment) => assignment.isSignature)).toEqual([
    true,
    false,
    false,
  ]);
  expect(new Set(assignments.map((assignment) => assignment.cardId)).size).toBe(
    3,
  );
  for (const assignment of assignments) {
    expect(Object.keys(assignment).sort()).toEqual([
      "cardId",
      "isSignature",
      "optionA",
      "optionB",
      "position",
      "stage",
      "visitorChoice",
      "visitorPrompt",
    ]);
    expect(assignment.visitorChoice).toBeNull();
  }
}

function expectExactSubmittedResponse(body: string) {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  expect(Object.keys(parsed).sort()).toEqual([
    "allMatched",
    "assignments",
    "id",
    "knownSinceCode",
    "knownSinceLabel",
    "relationshipCode",
    "relationshipLabel",
    "sessionExpiresAt",
    "sessionTtlSeconds",
    "status",
  ]);
  expect(parsed.status).toBe("submitted");
  expect(typeof parsed.allMatched).toBe("boolean");
  const submittedAssignments = parsed.assignments as Record<string, unknown>[];
  expect(submittedAssignments).toHaveLength(3);
  for (const assignment of submittedAssignments) {
    expect(Object.keys(assignment).sort()).toEqual([
      "cardId",
      "isHighlight",
      "isSignature",
      "matches",
      "optionA",
      "optionB",
      "ownerChoice",
      "position",
      "stage",
      "visitorChoice",
      "visitorPrompt",
    ]);
    expect(["a", "b"]).toContain(assignment.visitorChoice);
    expect(["a", "b"]).toContain(assignment.ownerChoice);
  }
  expect(JSON.stringify(parsed)).not.toMatch(
    /token|hash|secret|linkId|playId/i,
  );
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
    test.setTimeout(90_000);
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
    const oneToOneInviteUrl = await page
      .getByLabel("공유 링크 직접 복사")
      .inputValue();
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

    const oneToOneInvite = new URL(oneToOneInviteUrl);
    const oneToOneStart = await postRawVisitorResponse({
      publicId: oneToOneInvite.pathname.split("/").at(-1)!,
      secret: rawSecretFrom(oneToOneInviteUrl),
      ip: "198.51.100.224",
      body: {
        intent: "start",
        secret: rawSecretFrom(oneToOneInviteUrl),
        relationshipCode: "coworker",
        knownSinceCode: "three_to_five_years",
      },
    });
    expect(oneToOneStart.fingerprint.status).toBe(201);
    expect(oneToOneStart.setsSessionCookie).toBe(true);
    expectExactAssignmentResponse(oneToOneStart.fingerprint.body);
    const oneToOneResume = await postRawVisitorResponse({
      publicId: oneToOneInvite.pathname.split("/").at(-1)!,
      secret: rawSecretFrom(oneToOneInviteUrl),
      ip: "198.51.100.224",
      cookie: `__Host-gyeop-response=${oneToOneStart.sessionCookie}`,
    });
    expect(oneToOneResume.fingerprint.status).toBe(200);
    expectExactAssignmentResponse(oneToOneResume.fingerprint.body);
    expect(JSON.parse(oneToOneResume.fingerprint.body).assignments).toEqual(
      JSON.parse(oneToOneStart.fingerprint.body).assignments,
    );
    const oneToOneInvalidSecret = await postRawVisitorResponse({
      publicId: oneToOneInvite.pathname.split("/").at(-1)!,
      secret: rawSecretFrom(inviteUrl),
      ip: "198.51.100.225",
    });
    expect(oneToOneInvalidSecret.fingerprint.status).toBe(404);

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

    setVisitorLinkStatus(
      oneToOneInvite.pathname.split("/").at(-1)!,
      "disabled",
    );
    const oneToOneInactive = await postRawVisitorResponse({
      publicId: oneToOneInvite.pathname.split("/").at(-1)!,
      secret: rawSecretFrom(oneToOneInviteUrl),
      ip: "198.51.100.225",
    });
    expect(oneToOneInactive.fingerprint).toEqual(
      oneToOneInvalidSecret.fingerprint,
    );
    setVisitorLinkStatus(oneToOneInvite.pathname.split("/").at(-1)!, "active");

    const invite = new URL(inviteUrl);
    const publicId = invite.pathname.split("/").at(-1)!;
    const rawSecret = new URLSearchParams(invite.hash.slice(1)).get("k")!;
    const visitors = await Promise.all(
      [
        {
          ip: "198.51.100.220",
          relationship: "오래된 친구",
          knownSince: "10년 이상이에요",
          complete: true,
        },
        {
          ip: "198.51.100.221",
          relationship: "가족",
          knownSince: "1년 이상 · 3년 미만",
          complete: false,
        },
      ].map(async ({ ip, relationship, knownSince, complete }) => {
        const visitorContext = await browser.newContext({
          extraHTTPHeaders: { ...visitorHeaders, "x-forwarded-for": ip },
        });
        const visitor = await visitorContext.newPage();
        await visitor.goto(inviteUrl);
        await expect(
          visitor.getByRole("heading", {
            name: "이 사람과 어떤 사이인가요?",
          }),
        ).toBeFocused();
        await visitor
          .getByRole("radio", { name: relationship, exact: true })
          .check();
        await visitor
          .getByRole("radio", { name: knownSince, exact: true })
          .check();
        await visitor.getByRole("button", { name: "3장 답하러 가기" }).click();
        await expect(
          visitor.getByRole("heading", {
            name: "서운한 일이 생기면 이 사람은?",
          }),
        ).toBeFocused();
        if (complete) {
          await visitor.getByRole("button", { name: /^B / }).click();
          await visitor.getByRole("button", { name: /^A / }).click();
          await visitor.getByRole("button", { name: /^A / }).click();
          await expect(visitor.getByText("3장 비교 완료")).toBeVisible({
            timeout: 15_000,
          });
          await expect(
            visitor.getByRole("link", { name: "나도 이 팩으로 시작하기" }),
          ).toHaveAttribute(
            "href",
            "/play/new?pack=old-friend&source=same_pack_cta",
          );
        }
        const sessionCookie = (await visitorContext.cookies()).find(
          (cookie) => cookie.name === "__Host-gyeop-response",
        );
        expect(sessionCookie).toMatchObject({
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          path: "/",
        });
        expect(sessionCookie?.value).toMatch(
          /^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/,
        );
        return {
          visitor,
          visitorContext,
          cookieValue: sessionCookie!.value,
        };
      }),
    );

    await visitors[0].visitor.reload();
    await expect(visitors[0].visitor.getByText("3장 비교 완료")).toBeVisible();
    await expect(
      visitors[0].visitor.getByText("오래된 친구", { exact: true }),
    ).toBeVisible();
    const publicResume = await postRawVisitorResponse({
      publicId,
      secret: rawSecret,
      cookie: `__Host-gyeop-response=${visitors[0].cookieValue}`,
      ip: "198.51.100.220",
    });
    expect(publicResume.fingerprint.status).toBe(200);
    expectExactSubmittedResponse(publicResume.fingerprint.body);
    await expect
      .poll(() => readVisitorResponseSummary(publicId))
      .toEqual({
        responses: 2,
        sessionHashes: 2,
        assignments: 6,
        signatureAssignments: 2,
        contexts: [
          {
            relationship: "family",
            knownSince: "one_to_three_years",
            status: "draft",
            fixedTtl: true,
          },
          {
            relationship: "old_friend",
            knownSince: "ten_years_or_more",
            status: "submitted",
            fixedTtl: true,
          },
        ],
        events: {
          comparison_viewed: 1,
          relationship_selected: 2,
          visitor_required_answer_saved: 3,
          visitor_required_submitted: 1,
          visitor_response_started: 2,
        },
      });

    const unavailable = await postRawVisitorResponse({
      publicId: Buffer.alloc(16, 3).toString("base64url"),
      secret: rawSecret,
    });
    const malformed = await postRawVisitorResponse({
      publicId,
      secret: rawSecret,
      cookie: "__Host-gyeop-response",
    });
    const duplicate = await postRawVisitorResponse({
      publicId,
      secret: rawSecret,
      cookie: `__Host-gyeop-response; __Host-gyeop-response=${visitors[0].cookieValue}`,
    });
    for (const rejected of [malformed, duplicate]) {
      expect(rejected.fingerprint).toEqual(unavailable.fingerprint);
      expect(rejected.deletesCookie).toBe(true);
    }
    expect(unavailable.deletesCookie).toBe(false);

    const responseId = visitors[0].cookieValue.split(".")[1];
    const tampered = await postRawVisitorResponse({
      publicId,
      secret: rawSecret,
      cookie: `__Host-gyeop-response=v1.${responseId}.${"A".repeat(43)}`,
    });
    expect(tampered.fingerprint).toEqual(unavailable.fingerprint);
    expect(tampered.deletesCookie).toBe(true);

    const expiredResponseId = visitors[1].cookieValue.split(".")[1];
    expireVisitorResponse(expiredResponseId);
    const expired = await postRawVisitorResponse({
      publicId,
      secret: rawSecret,
      cookie: `__Host-gyeop-response=${visitors[1].cookieValue}`,
    });
    expect(expired.fingerprint).toEqual(unavailable.fingerprint);
    expect(expired.deletesCookie).toBe(true);

    const startResults: Awaited<ReturnType<typeof postRawVisitorResponse>>[] =
      [];
    for (let request = 0; request < 11; request += 1) {
      startResults.push(
        await postRawVisitorResponse({
          publicId,
          secret: rawSecret,
          ip: "198.51.100.223",
          body: {
            intent: "start",
            secret: rawSecret,
            relationshipCode: "online_friend",
            knownSinceCode: "not_sure",
          },
        }),
      );
    }
    expect(
      startResults
        .slice(0, 10)
        .every(
          (result) =>
            result.fingerprint.status === 201 && result.setsSessionCookie,
        ),
    ).toBe(true);
    expectExactAssignmentResponse(startResults[0].fingerprint.body);
    expect(startResults[10].fingerprint.status).toBe(429);
    expect(Number(startResults[10].retryAfter)).toBeGreaterThan(0);
    expect(startResults[10].setsSessionCookie).toBe(false);
    expect(readVisitorResponseCounts(publicId)).toEqual({
      responses: 12,
      relationshipEvents: 12,
      startedEvents: 12,
      maxBucket: 10,
    });

    const rateContext = await browser.newContext({
      extraHTTPHeaders: {
        ...visitorHeaders,
        "x-forwarded-for": "198.51.100.222",
      },
    });
    const ratePage = await rateContext.newPage();
    await ratePage.goto("/");
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

    await visitors[0].visitor.goto(rotatedUrl);
    await expect(
      visitors[0].visitor.getByRole("heading", {
        name: "이 사람과 어떤 사이인가요?",
      }),
    ).toBeFocused();
    await visitors[0].visitor
      .getByRole("radio", { name: "학교 친구", exact: true })
      .check();
    await visitors[0].visitor
      .getByRole("radio", { name: "1년 미만이에요", exact: true })
      .check();
    await visitors[0].visitor
      .getByRole("button", { name: "3장 답하러 가기" })
      .click();
    await expect(
      visitors[0].visitor.getByRole("heading", {
        name: "서운한 일이 생기면 이 사람은?",
      }),
    ).toBeFocused();
    const crossLinkCookie = (await visitors[0].visitorContext.cookies()).find(
      (cookie) => cookie.name === "__Host-gyeop-response",
    );
    expect(
      crossLinkCookie?.value.split(".")[1] !==
        visitors[0].cookieValue.split(".")[1],
    ).toBe(true);

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
