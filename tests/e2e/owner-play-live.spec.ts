import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  claimCompletedOwner,
  claimCompletedOwnerAccount,
  signInOwnerAccount,
} from "./owner-auth-live-fixture";
import honestSelfManifest from "../../content/packs/honest-self-v1.json" with { type: "json" };

const live = process.env.GYEOP_E2E_LIVE === "1";
const databaseContainer = "supabase_db_gyeop";
const proxyKey = Buffer.alloc(32, 8).toString("base64url");
const visitorManagementSecret = Buffer.alloc(32, 6).toString("base64url");
const e2eBaseUrl = `http://127.0.0.1:${process.env.GYEOP_E2E_PORT ?? "3000"}`;
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

async function waitForOwnerPlayStart(page: Page) {
  const playUrl = /\/play\/[0-9a-f-]{36}$/;
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
    await retry.click();
    await expect(retry).toBeHidden();
  }
  await page.waitForURL(playUrl, { timeout: 15_000 });
}

type ShareActionEventRow = {
  event: "share_handoff_succeeded" | "share_link_copied";
  properties: Record<string, unknown>;
};

function readShareActionEvents(): ShareActionEventRow[] {
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
  return JSON.parse(output.trim()) as ShareActionEventRow[];
}

function readShareActionEventsSince(
  baseline: ShareActionEventRow[],
): ShareActionEventRow[] {
  const current = readShareActionEvents();
  return (["share_handoff_succeeded", "share_link_copied"] as const).flatMap(
    (event) => {
      const baselineCount = baseline.filter(
        (row) => row.event === event,
      ).length;
      return current.filter((row) => row.event === event).slice(baselineCount);
    },
  );
}

function readProfileReshareClickEvents() {
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
      `select coalesce(jsonb_agg(properties order by occurred_at, id), '[]'::jsonb)
       from public.analytics_events
       where event_name = 'profile_reshare_clicked'`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output.trim()) as unknown;
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
  return JSON.parse(output.trim()) as Record<string, number>;
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

function readVisitorMutationSummary(responseId: string) {
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
      `select jsonb_build_object(
        'status', response.status,
        'answerCount', (select count(*) from public.visitor_answers as answer where answer.response_id = response.id),
        'answerEvents', (select count(*) from public.analytics_events as event where event.visitor_response_id = response.id and event.event_name = 'visitor_required_answer_saved'),
        'submitEvents', (select count(*) from public.analytics_events as event where event.visitor_response_id = response.id and event.event_name = 'visitor_required_submitted'),
        'managed', response.management_token_hash is not null
      )
      from public.visitor_responses as response
      where response.id = '${responseId}'`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output.trim()) as {
    status: "draft" | "submitted";
    answerCount: number;
    answerEvents: number;
    submitEvents: number;
    managed: boolean;
  };
}

function seedResponseActionLimit(
  responseId: string,
  action: "response_answer_save" | "response_submit",
  count: number,
  limit: 10 | 120,
) {
  const tag =
    action === "response_answer_save"
      ? "gyeop-response-answer-save-v1"
      : "gyeop-response-submit-v1";
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
      `do $block$
      declare
        v_index integer;
        v_key bytea := pg_catalog.sha256(
          convert_to('${tag}', 'UTF8')
          || decode('00', 'hex')
          || convert_to('${responseId}', 'UTF8')
        );
      begin
        delete from public.rate_limit_buckets
        where key_hash = v_key and action = '${action}';
        for v_index in 1..${count} loop
          perform public.consume_rate_limit(v_key, '${action}', 600, ${limit});
        end loop;
      end
      $block$;`,
    ],
    { stdio: "ignore" },
  );
}

async function rawVisitorAction(
  request: APIRequestContext,
  input: {
    path: string;
    method: "POST" | "PUT";
    cookieValue: string;
    body: unknown;
  },
) {
  const response = await request.fetch(input.path, {
    method: input.method,
    headers: {
      cookie: `__Host-gyeop-response=${input.cookieValue}`,
      origin: e2eBaseUrl,
    },
    data: input.body,
  });
  return {
    status: response.status(),
    cacheControl: response.headers()["cache-control"] ?? null,
    retryAfter: response.headers()["retry-after"] ?? null,
  };
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
    origin: e2eBaseUrl,
    "content-type": "application/json",
  };
  if (input.ip) headers["x-forwarded-for"] = input.ip;
  if (input.cookie) headers.cookie = input.cookie;
  const response = await fetch(
    `${e2eBaseUrl}/api/invites/${input.publicId}/responses`,
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
    "packSlug",
    "packTitle",
    "packVersion",
    "relationshipCode",
    "relationshipLabel",
    "sessionExpiresAt",
    "sessionTtlSeconds",
    "status",
  ]);
  expect(parsed).toMatchObject({
    packSlug: "old-friend",
    packVersion: "old-friend-v1",
    packTitle: "오래 본 너의 시선",
  });
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
    "packSlug",
    "packTitle",
    "packVersion",
    "relationshipCode",
    "relationshipLabel",
    "sessionExpiresAt",
    "sessionTtlSeconds",
    "status",
  ]);
  expect(parsed).toMatchObject({
    packSlug: "old-friend",
    packVersion: "old-friend-v1",
    packTitle: "오래 본 너의 시선",
  });
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
      "packPosition",
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

  test("keeps multiple packs under one anonymous owner and resumes each pack", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/play/new?pack=old-friend");
    await waitForOwnerPlayStart(page);
    const oldFriendUrl = page.url();
    await page.locator('button[data-choice="a"]').click();
    await expect(page.locator('[data-state="saved"]')).toBeVisible();
    const ownerCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "__Host-gyeop-owner",
    );

    await page.goto("/play/new?pack=honest-self");
    await waitForOwnerPlayStart(page);
    const honestSelfUrl = page.url();
    expect(page.url()).not.toBe(oldFriendUrl);
    await page.locator('button[data-choice="b"]').click();
    await expect(page.locator('[data-state="saved"]')).toBeVisible();
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === "__Host-gyeop-owner",
      )?.value,
    ).toBe(ownerCookie?.value);

    await page.goto("/play/new?pack=old-friend");
    await waitForOwnerPlayStart(page);
    await expect(page).toHaveURL(oldFriendUrl);
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
    const account = await claimCompletedOwnerAccount(page);

    const recoveredContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      extraHTTPHeaders: {
        ...visitorHeaders,
        "x-forwarded-for": "198.51.100.220",
      },
    });
    const recoveredPage = await recoveredContext.newPage();
    await recoveredPage.goto("/play/new?pack=coworker");
    await waitForOwnerPlayStart(recoveredPage);
    expect(
      (await recoveredContext.cookies()).some(
        (cookie) => cookie.name === "__Host-gyeop-owner",
      ),
    ).toBe(true);
    await recoveredPage.goto("/me");
    const claimedDraftId = honestSelfUrl.split("/").at(-1)!;
    const signedOutStatuses = await recoveredPage.evaluate(
      async ({ cardId, claimedDraftId, completedPlayId }) =>
        Promise.all([
          fetch(`/api/plays/${claimedDraftId}`, {
            credentials: "same-origin",
          }).then((response) => response.status),
          fetch(`/api/plays/${claimedDraftId}/answers/${cardId}`, {
            method: "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ choice: "a", currentPosition: 2 }),
          }).then((response) => response.status),
          fetch(`/api/plays/${claimedDraftId}/complete`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: "{}",
          }).then((response) => response.status),
          fetch(`/api/me/plays/${completedPlayId}/links`, {
            credentials: "same-origin",
          }).then((response) => response.status),
          fetch(`/api/me/profile?playId=${completedPlayId}`, {
            credentials: "same-origin",
          }).then((response) => response.status),
          fetch(`/api/me/plays/${completedPlayId}/responses?kind=one_to_one`, {
            credentials: "same-origin",
          }).then((response) => response.status),
        ]),
      {
        cardId: honestSelfManifest.cards[0].id,
        claimedDraftId,
        completedPlayId: account.playId,
      },
    );
    expect(signedOutStatuses).toEqual([401, 401, 401, 401, 401, 401]);

    await recoveredPage.goto(honestSelfUrl);
    await expect(
      recoveredPage.getByRole("heading", { name: "다시 로그인해 주세요" }),
    ).toBeFocused();
    await expect(
      recoveredPage.getByRole("link", { name: "이메일로 로그인" }),
    ).toHaveAttribute("href", "/auth/sign-in?returnTo=%2Fme");

    await signInOwnerAccount(recoveredPage, account.email);
    await recoveredPage.getByRole("link", { name: "이어서 답하기" }).click();
    await expect(recoveredPage).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
    expect(
      (await recoveredContext.cookies()).some(
        (cookie) => cookie.name === "__Host-gyeop-owner",
      ),
    ).toBe(true);
    for (let position = 2; position <= 10; position += 1) {
      await recoveredPage.locator('button[data-choice="a"]').click();
    }
    await expect(
      recoveredPage.getByRole("heading", {
        name: "내 답변 10개가 저장됐어요",
      }),
    ).toBeVisible({ timeout: 15_000 });
    await recoveredContext.close();
  });

  test("keeps a Secure HttpOnly capability through save, reload, and completion", async ({
    browser,
    context,
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const initialShareActionEvents = readShareActionEvents();
    const initialCoreFunnel = readCoreFunnelStageCounts();
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
    await waitForOwnerPlayStart(page);
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

    const claimedPlayId = await claimCompletedOwner(page);
    await page.getByRole("button", { name: "공유 링크 만들기" }).click();
    const inviteUrl = await page.getByLabel("공유 링크 직접 복사").inputValue();
    expect(
      /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/i\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/.test(
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
      .poll(() => readShareActionEventsSince(initialShareActionEvents))
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
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      2,
    );
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
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      2,
    );
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
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      2,
    );

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
    ).toMatchObject({ status: 401, cacheControl: "private, no-store" });
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
    ).toMatchObject({ status: 401, cacheControl: "private, no-store" });
    await tamperedContext.close();
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      2,
    );

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
          const questionHeading = visitor.getByRole("heading", { level: 1 });
          const firstPrompt = await questionHeading.textContent();
          await visitor.getByRole("button", { name: /^B / }).click();
          await expect(questionHeading).not.toHaveText(firstPrompt ?? "");
          await expect(questionHeading).toBeFocused();
          const secondPrompt = await questionHeading.textContent();
          await visitor.getByRole("button", { name: /^A / }).click();
          await expect(questionHeading).not.toHaveText(secondPrompt ?? "");
          await expect(questionHeading).toBeFocused();
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

    await visitors[0].visitor
      .getByRole("link", { name: "나도 이 팩으로 시작하기" })
      .click();
    await visitors[0].visitor.waitForURL(/\/play\/[0-9a-f-]{36}$/);
    await expect(
      visitors[0].visitor.getByRole("heading", {
        name: "서운한 일이 생기면 나는?",
      }),
    ).toBeVisible();
    await visitors[0].visitor.goto(inviteUrl);
    await expect(visitors[0].visitor.getByText("3장 비교 완료")).toBeVisible();

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
          pack_opened: 1,
          relationship_selected: 2,
          same_pack_start_clicked: 1,
          visitor_required_answer_saved: 3,
          visitor_required_submitted: 1,
          visitor_response_started: 2,
        },
      });

    const submittedResponseId = visitors[0].cookieValue.split(".")[1];
    const submittedManagementSecret = await visitors[0].visitor.evaluate(
      (id) => {
        const value = localStorage.getItem(`gyeop:visitor-management:v1:${id}`);
        return value ? (JSON.parse(value) as { secret: string }).secret : null;
      },
      submittedResponseId,
    );
    expect(submittedManagementSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    seedResponseActionLimit(
      submittedResponseId,
      "response_answer_save",
      119,
      120,
    );
    const submittedAnswerResults = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      submittedAnswerResults.push(
        await rawVisitorAction(request, {
          path: `/api/responses/${submittedResponseId}/answers/conflict`,
          method: "PUT",
          cookieValue: visitors[0].cookieValue,
          body: { choice: "a" },
        }),
      );
    }
    expect(
      submittedAnswerResults
        .slice(0, -1)
        .every(
          ({ status, cacheControl }) =>
            status === 409 && cacheControl === "private, no-store",
        ),
    ).toBe(true);
    expect(submittedAnswerResults.at(-1)?.status).toBe(429);
    expect(Number(submittedAnswerResults.at(-1)?.retryAfter)).toBeGreaterThan(
      0,
    );

    seedResponseActionLimit(submittedResponseId, "response_submit", 9, 10);
    const duplicateSubmitResults = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      duplicateSubmitResults.push(
        await rawVisitorAction(request, {
          path: `/api/responses/${submittedResponseId}/submit`,
          method: "POST",
          cookieValue: visitors[0].cookieValue,
          body: { managementSecret: submittedManagementSecret },
        }),
      );
    }
    expect(
      duplicateSubmitResults
        .slice(0, -1)
        .every(
          ({ status, cacheControl }) =>
            status === 200 && cacheControl === "private, no-store",
        ),
    ).toBe(true);
    expect(duplicateSubmitResults.at(-1)?.status).toBe(429);
    expect(Number(duplicateSubmitResults.at(-1)?.retryAfter)).toBeGreaterThan(
      0,
    );
    expect(readVisitorMutationSummary(submittedResponseId)).toEqual({
      status: "submitted",
      answerCount: 3,
      answerEvents: 3,
      submitEvents: 1,
      managed: true,
    });

    const incompleteResponseId = visitors[1].cookieValue.split(".")[1];
    seedResponseActionLimit(incompleteResponseId, "response_submit", 9, 10);
    const incompleteSubmitResults = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      incompleteSubmitResults.push(
        await rawVisitorAction(request, {
          path: `/api/responses/${incompleteResponseId}/submit`,
          method: "POST",
          cookieValue: visitors[1].cookieValue,
          body: { managementSecret: visitorManagementSecret },
        }),
      );
    }
    expect(
      incompleteSubmitResults
        .slice(0, -1)
        .every(({ status }) => status === 409),
    ).toBe(true);
    expect(incompleteSubmitResults.at(-1)?.status).toBe(429);
    expect(Number(incompleteSubmitResults.at(-1)?.retryAfter)).toBeGreaterThan(
      0,
    );

    seedResponseActionLimit(
      incompleteResponseId,
      "response_answer_save",
      119,
      120,
    );
    const draftAnswerResults = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      draftAnswerResults.push(
        await rawVisitorAction(request, {
          path: `/api/responses/${incompleteResponseId}/answers/conflict`,
          method: "PUT",
          cookieValue: visitors[1].cookieValue,
          body: { choice: "a" },
        }),
      );
    }
    expect(
      draftAnswerResults
        .slice(0, -1)
        .every(
          ({ status, cacheControl }) =>
            status === 200 && cacheControl === "private, no-store",
        ),
    ).toBe(true);
    expect(draftAnswerResults.at(-1)?.status).toBe(429);
    expect(Number(draftAnswerResults.at(-1)?.retryAfter)).toBeGreaterThan(0);
    expect(readVisitorMutationSummary(incompleteResponseId)).toEqual({
      status: "draft",
      answerCount: 1,
      answerEvents: 1,
      submitEvents: 0,
      managed: false,
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

    const expiredSessionCookie = startResults[0].sessionCookie;
    if (!expiredSessionCookie) throw new Error("live response cookie missing");
    const expiredActionResponseId = expiredSessionCookie.split(".")[1];
    const expiredAssignment = JSON.parse(startResults[0].fingerprint.body)
      .assignments[0] as { cardId: string };
    expireVisitorResponse(expiredActionResponseId);
    seedResponseActionLimit(
      expiredActionResponseId,
      "response_answer_save",
      119,
      120,
    );
    const expiredAnswerResults = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expiredAnswerResults.push(
        await rawVisitorAction(request, {
          path: `/api/responses/${expiredActionResponseId}/answers/${expiredAssignment.cardId}`,
          method: "PUT",
          cookieValue: expiredSessionCookie,
          body: { choice: "a" },
        }),
      );
    }
    expect(
      expiredAnswerResults
        .slice(0, -1)
        .every(
          ({ status, cacheControl }) =>
            status === 404 && cacheControl === "private, no-store",
        ),
    ).toBe(true);
    expect(expiredAnswerResults.at(-1)?.status).toBe(429);
    expect(Number(expiredAnswerResults.at(-1)?.retryAfter)).toBeGreaterThan(0);
    expect(readVisitorMutationSummary(expiredActionResponseId)).toEqual({
      status: "draft",
      answerCount: 0,
      answerEvents: 0,
      submitEvents: 0,
      managed: false,
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
        }
        return results;
      },
      { publicId, rawSecret },
    );
    expect(rateResults).toHaveLength(121);
    expect(
      rateResults.every(
        (result) => result.status === 200 && result.retryAfter === null,
      ),
    ).toBe(true);
    await rateContext.close();

    const initialProfileReshareEvents =
      readProfileReshareClickEvents() as Array<{
        packVersion: string;
        entrySource: string;
      }>;
    await page.goto(`/me/profile/${claimedPlayId}`);
    await expect(
      page.getByRole("heading", { name: "내 시선 프로필" }),
    ).toBeFocused();
    await expect(page.getByText("공개 링크로 도착한 시선")).toBeVisible();
    await page.getByRole("link", { name: "시선 더 모으기" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/me/plays/${ownerCookie!.value.split(".")[1]}\\?entry_source=profile_reshare$`,
      ),
    );
    await expect
      .poll(() => readProfileReshareClickEvents())
      .toEqual([
        ...initialProfileReshareEvents,
        { packVersion: "old-friend-v1", entrySource: "profile_reshare" },
      ]);
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
      .poll(() => readShareActionEventsSince(initialShareActionEvents))
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
            entrySource: "profile_reshare",
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

    const crossLinkQuestion = visitors[0].visitor.getByRole("heading", {
      level: 1,
    });
    const crossLinkFirstPrompt = await crossLinkQuestion.textContent();
    await visitors[0].visitor.getByRole("button", { name: /^B / }).click();
    await expect(crossLinkQuestion).not.toHaveText(crossLinkFirstPrompt ?? "");
    const crossLinkSecondPrompt = await crossLinkQuestion.textContent();
    await visitors[0].visitor.getByRole("button", { name: /^A / }).click();
    await expect(crossLinkQuestion).not.toHaveText(crossLinkSecondPrompt ?? "");
    await visitors[0].visitor.getByRole("button", { name: /^A / }).click();
    await expect(visitors[0].visitor.getByText("3장 비교 완료")).toBeVisible({
      timeout: 15_000,
    });

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
    await expect
      .poll(() => {
        const current = readCoreFunnelStageCounts();
        return Object.fromEntries(
          coreFunnelKeys.map((key) => [
            key,
            (current[key] ?? 0) - (initialCoreFunnel[key] ?? 0),
          ]),
        );
      })
      .toEqual({
        "owner_share:self_pack_completed": 1,
        "owner_share:public_link_created": 1,
        "owner_share:public_share_succeeded": 1,
        "visitor_same_pack:visitor_required_submitted": 2,
        "visitor_same_pack:comparison_viewed": 2,
        "visitor_same_pack:same_pack_start_clicked": 1,
        "visitor_same_pack:new_owner_pack_opened": 1,
        "profile_reshare:profile_viewed": 1,
        "profile_reshare:profile_reshare_clicked": 1,
        "profile_reshare:profile_share_succeeded": 1,
        "profile_reshare:downstream_visitor_submitted": 1,
      });

    const staleClientSuccess = await postShareAction(
      page,
      ownerCookie!.value.split(".")[1],
      activeOneToOne!.id,
    );
    expect(staleClientSuccess).toMatchObject({
      status: 204,
      cacheControl: "private, no-store",
    });
    await expect
      .poll(() => readShareActionEventsSince(initialShareActionEvents))
      .toHaveLength(4);
    expect(
      readShareActionEventsSince(initialShareActionEvents).filter(
        ({ event }) => event === "share_link_copied",
      ),
    ).toEqual([
      {
        event: "share_link_copied",
        properties: {
          packVersion: "old-friend-v1",
          linkKind: "one_to_one",
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
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      4,
    );

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
    expect(readShareActionEventsSince(initialShareActionEvents)).toHaveLength(
      4,
    );

    for (const { visitorContext } of visitors) await visitorContext.close();
  });
});

function rawSecretFrom(inviteUrl: string) {
  const url = new URL(inviteUrl);
  return new URLSearchParams(url.hash.slice(1)).get("k")!;
}
