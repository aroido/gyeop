import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { signInOwnerAccount } from "./owner-auth-live-fixture";

const live = process.env.GYEOP_E2E_LIVE === "1";
const conceptEnabled = process.env.GYEOP_CONCEPT_PROFILE_ENABLED === "true";
const databaseContainer = "supabase_db_gyeop";

function sql(statement: string, output = false) {
  const result = execFileSync(
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
      ...(output ? ["-At"] : []),
      "-c",
      statement,
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  return typeof result === "string" ? result.trim() : "";
}

function bytea() {
  return Buffer.from(randomBytes(32)).toString("hex");
}

function publicId() {
  return randomBytes(16).toString("base64url");
}

function insertCompletedConceptPlay({
  userId,
  packVersion,
  requiredCards,
  responseCount = 3,
}: {
  userId: string;
  packVersion: string;
  requiredCards: [string, string, string];
  responseCount?: 0 | 3;
}) {
  const playId = randomUUID();
  const anonymousOwnerId = randomUUID();
  const linkId = randomUUID();
  const responses = Array.from({ length: responseCount }, () => ({
    id: randomUUID(),
    session: bytea(),
    management: bytea(),
  }));
  const responseValues = responses
    .map(
      (response) =>
        `('${response.id}'::uuid, '${linkId}'::uuid, version.id, 'old_friend', ` +
        `'ten_years_or_more', 'submitted', decode('${response.session}', 'hex'), ` +
        `fixed.value + interval '24 hours', decode('${response.management}', 'hex'), ` +
        "fixed.value, fixed.value)",
    )
    .join(",\n");
  const assignmentValues = responses
    .flatMap((response) =>
      requiredCards.map(
        (cardId, index) =>
          `('${response.id}'::uuid, version.id, '${cardId}', 'required', ${index + 1}::smallint)`,
      ),
    )
    .join(",\n");
  const answerValues = responses
    .flatMap((response) =>
      requiredCards.map(
        (cardId) => `('${response.id}'::uuid, version.id, '${cardId}', 'a')`,
      ),
    )
    .join(",\n");
  const visitorSql =
    responses.length === 0
      ? ""
      : `
        with fixed as (select clock_timestamp() as value),
        version as (
          select id from public.pack_versions where version = '${packVersion}'
        )
        insert into public.visitor_responses (
          id, share_link_id, pack_version_id, relationship_code,
          known_since_code, status, session_token_hash, session_expires_at,
          management_token_hash, submitted_at, created_at
        )
        select fixture.*
        from fixed
        cross join version
        cross join lateral (values
          ${responseValues}
        ) as fixture(
          id, share_link_id, pack_version_id, relationship_code,
          known_since_code, status, session_token_hash, session_expires_at,
          management_token_hash, submitted_at, created_at
        );

        with version as (
          select id from public.pack_versions where version = '${packVersion}'
        )
        insert into public.visitor_assignments (
          response_id, pack_version_id, card_id, stage, position
        )
        select fixture.*
        from version
        cross join lateral (values
          ${assignmentValues}
        ) as fixture(response_id, pack_version_id, card_id, stage, position);

        with version as (
          select id from public.pack_versions where version = '${packVersion}'
        )
        insert into public.visitor_answers (
          response_id, pack_version_id, card_id, choice
        )
        select fixture.*
        from version
        cross join lateral (values
          ${answerValues}
        ) as fixture(response_id, pack_version_id, card_id, choice);
      `;
  sql(`
    with fixed as (select clock_timestamp() as value)
    insert into public.anonymous_owners (
      id, management_secret_hash, management_expires_at, last_active_at,
      management_revoked_at, created_at, updated_at
    ) select
      '${anonymousOwnerId}', decode('${bytea()}', 'hex'),
      value + interval '7 days', value, null, value, value
    from fixed;

    with fixed as (select clock_timestamp() as value)
    insert into public.pack_plays (
      id, pack_version_id, anonymous_owner_id, owner_id,
      management_secret_hash, management_expires_at, last_active_at,
      management_revoked_at, status, current_position, completed_at
    )
    select
      '${playId}', version.id, '${anonymousOwnerId}', '${userId}',
      null, fixed.value + interval '7 days', fixed.value, fixed.value,
      'draft', 1, null
    from public.pack_versions as version
    cross join fixed
    where version.version = '${packVersion}';

    insert into public.self_answers (
      pack_play_id, pack_version_id, card_id, choice
    )
    select '${playId}', version.id, card.id, 'a'
    from public.pack_versions as version
    join public.pack_cards as card on card.pack_version_id = version.id
    where version.version = '${packVersion}';

    update public.pack_plays
    set status = 'completed',
        current_position = 10,
        completed_at = clock_timestamp()
    where id = '${playId}';

    insert into public.share_links (
      id, public_id, pack_play_id, kind, secret_hash, status
    ) values (
      '${linkId}', '${publicId()}', '${playId}', 'public',
      decode('${bytea()}', 'hex'), 'active'
    );
    ${visitorSql}
  `);
  return { anonymousOwnerId, playId };
}

function cleanupOwnerFixtures(
  userId: string,
  fixtures: Array<{ playId: string }>,
) {
  const playIds =
    fixtures.map(({ playId }) => `'${playId}'`).join(",") || "null";
  sql(`
    update public.pack_plays
    set owner_id = null
    where id in (${playIds});
    delete from public.owner_public_profiles where owner_id = '${userId}';
    delete from auth.users where id = '${userId}';
  `);
}

test.describe("concept owner profile live", () => {
  test.skip(
    !live || !conceptEnabled,
    "requires live Supabase and concept=true",
  );

  test("renders and confirms a safe hook at 320, 390, and 430px", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript({
      content: `
        (() => {
          const originalCreateElement = Document.prototype.createElement;
          Document.prototype.createElement = function (name, options) {
            const element = originalCreateElement.call(this, name, options);
            if (String(name).toLowerCase() !== "canvas") return element;
            const canvas = element;
            const originalToBlob = canvas.toBlob;
            canvas.toBlob = function (callback, type, quality) {
              window.__gyeopRenderedCanvasSizes = [
                ...(window.__gyeopRenderedCanvasSizes || []),
                [this.width, this.height],
              ];
              return originalToBlob.call(this, callback, type, quality);
            };
            return canvas;
          };
        })();
      `,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const email = `concept-e2e-${randomUUID()}@example.com`;
    await signInOwnerAccount(page, email, { profile: "new" });
    const userId = sql(
      `select id from auth.users where email = '${email}'`,
      true,
    );
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    const fixtures: Array<{
      anonymousOwnerId: string;
      playId: string;
    }> = [];
    try {
      fixtures.push(
        insertCompletedConceptPlay({
          userId,
          packVersion: "old-friend-v3",
          requiredCards: ["conflict", "celebration", "plans"],
        }),
        insertCompletedConceptPlay({
          userId,
          packVersion: "after-work-v3",
          requiredCards: ["message-after", "decompress", "weeknight"],
        }),
      );
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/me");
        const hooks = page.locator("[data-concept-card]");
        await expect(hooks).toHaveCount(3);
        await expect(hooks.first()).toHaveAttribute(
          "data-stage",
          /^(trace|outline|clear)$/,
        );
        await expect(hooks.first()).toContainText(/근거 (흔적|윤곽|선명)/);
        await expect(hooks.first()).toContainText("● 내 위치");
        await expect(hooks.first()).toContainText("○ 지인 익명 집계");
        await expect(hooks.first()).toContainText(
          /내 답변[\s\S]*팩[\s\S]*맥락/,
        );
        await expect(
          hooks.first().getByLabel(/내 위치:.*근거 (흔적|윤곽|선명)/),
        ).toBeVisible();
        await expect(page.locator("blockquote")).toHaveCount(0);
        await expect(
          page.getByText(
            "한 장면의 답이 여러 팩에서 어떤 결로 이어졌는지 살펴보세요.",
            { exact: true },
          ),
        ).toHaveCount(0);
        const areaRail = page
          .getByRole("heading", { name: "8개 영역의 쌓임" })
          .locator("..");
        await expect(areaRail.locator("li")).toHaveCount(8);
        await expect(areaRail.locator("li").first()).toContainText(/문항 \d+/);
        await expect(areaRail).not.toContainText("팩");
        await expect(areaRail).not.toContainText("맥락");
        await expect(page.locator("[data-layer-count]")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "관계별로 보는 나" }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "내 질문팩 관리" }),
        ).toBeVisible();
        const share = page.getByRole("button", {
          name: "한 장으로 나누기",
        });
        await expect(share).toHaveCount(1);
        await expect(share).toBeVisible();
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
        expect(
          await page.evaluate(() => {
            const cards = [...document.querySelectorAll("article")].filter(
              (element) => element.hasAttribute("data-concept-card"),
            );
            const action = [...document.querySelectorAll("button")].find(
              (element) => element.textContent?.trim() === "한 장으로 나누기",
            );
            return Boolean(
              cards.at(-1) &&
              action &&
              cards.at(-1)!.getBoundingClientRect().top <
                action.getBoundingClientRect().top,
            );
          }),
        ).toBe(true);
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/me");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect(page.locator("[data-concept-card]")).toHaveCount(3);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });

      const stageStyles = await page
        .locator("article[data-stage]")
        .first()
        .evaluate((card) => {
          const originalStage = card.getAttribute("data-stage");
          const styles = ["trace", "outline", "clear"].map((stage) => {
            card.setAttribute("data-stage", stage);
            const style = getComputedStyle(card);
            return style.boxShadow;
          });
          if (originalStage) card.setAttribute("data-stage", originalStage);
          return styles;
        });
      expect(new Set(stageStyles).size).toBe(3);

      const detail = page
        .getByText("왜 이렇게 보일까?", { exact: true })
        .first();
      await detail.focus();
      await page.keyboard.press("Enter");
      await expect(detail.locator("..")).toHaveAttribute("open", "");
      expect(
        await detail.evaluate((node) => node.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);

      const before = Number(
        sql(
          "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
          true,
        ),
      );
      const share = page.getByRole("button", { name: "한 장으로 나누기" });
      await share.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(
        Number(
          sql(
            "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
            true,
          ),
        ),
      ).toBe(before);
      for (const control of [
        dialog.getByRole("button", { name: "닫기" }),
        dialog.getByRole("radio").first(),
        dialog.getByRole("button", { name: "이 내용으로 공유 카드 확인" }),
      ]) {
        expect(
          await control.evaluate((node) => node.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
      }

      let failOnce = true;
      await page.route("**/api/me/profile/events", async (route) => {
        const body = route.request().postDataJSON() as { event?: string };
        if (body.event === "profile_reshare_clicked" && failOnce) {
          failOnce = false;
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            headers: { "cache-control": "private, no-store" },
            body: JSON.stringify({
              code: "INTERNAL_ERROR",
              message: "요청을 처리하지 못했습니다.",
            }),
          });
        }
        return route.continue();
      });
      const confirm = dialog.getByRole("button", {
        name: "이 내용으로 공유 카드 확인",
      });
      await confirm.click();
      await expect(dialog.getByRole("status")).toContainText("다시 시도");
      await expect(page).toHaveURL(/\/me$/);
      await confirm.click();
      await expect(page).toHaveURL(
        /entry_source=profile_reshare&share_concept=/,
      );
      await expect(page.getByLabel(/공유 카드 미리보기$/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "이 카드 공유하기" }),
      ).toBeEnabled();
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                __gyeopRenderedCanvasSizes?: [number, number][];
              }
            ).__gyeopRenderedCanvasSizes ?? [],
        ),
      ).toContainEqual([1080, 1920]);
      expect(
        Number(
          sql(
            "select count(*) from public.analytics_events where event_name = 'profile_reshare_clicked'",
            true,
          ),
        ),
      ).toBe(before + 1);
    } finally {
      cleanupOwnerFixtures(userId, fixtures);
    }
  });

  test("keeps the collecting action below hooks when no concept is shareable", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const email = `concept-collecting-e2e-${randomUUID()}@example.com`;
    await signInOwnerAccount(page, email, { profile: "new" });
    const userId = sql(
      `select id from auth.users where email = '${email}'`,
      true,
    );
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    const fixtures: Array<{ playId: string }> = [];
    try {
      fixtures.push(
        insertCompletedConceptPlay({
          userId,
          packVersion: "old-friend-v3",
          requiredCards: ["conflict", "celebration", "plans"],
          responseCount: 0,
        }),
        insertCompletedConceptPlay({
          userId,
          packVersion: "after-work-v3",
          requiredCards: ["message-after", "decompress", "weeknight"],
          responseCount: 0,
        }),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/me");

      const lead = page.getByText(
        "한 장면의 답이 여러 팩에서 어떤 결로 이어졌는지 살펴보세요.",
        { exact: true },
      );
      const hooks = page.locator("[data-concept-card]");
      await expect(lead).toHaveCount(0);
      await expect(hooks).toHaveCount(3);
      const lockedStatus = hooks
        .first()
        .locator("p")
        .filter({ hasText: /시선을 모으는 중 · [0-2]\/3/ })
        .first();
      await expect(lockedStatus).toBeVisible();
      expect(
        await lockedStatus.evaluate(
          (node) =>
            ![...node.attributes].some(
              ({ name }) => name.startsWith("data-") || name === "aria-label",
            ),
        ),
      ).toBe(true);
      const collectingAction = page.getByRole("link", {
        name: "시선 더 모으기",
      });
      await expect(collectingAction).toBeVisible();
      await expect(
        page.getByRole("button", { name: "한 장으로 나누기" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "내 겹 공유하기" }),
      ).toHaveCount(0);
      await expect(page.locator("main header").getByRole("link")).toHaveCount(
        0,
      );
      const order = await Promise.all([
        hooks.first().boundingBox(),
        hooks.last().boundingBox(),
        collectingAction.boundingBox(),
      ]);
      expect(order.every(Boolean)).toBe(true);
      expect(order[0]!.y).toBeLessThan(order[1]!.y);
      expect(order[1]!.y).toBeLessThan(order[2]!.y);
    } finally {
      cleanupOwnerFixtures(userId, fixtures);
    }
  });
});
