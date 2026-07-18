import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const live = process.env.GYEOP_E2E_LIVE === "1";
const databaseContainer = "supabase_db_gyeop";

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
  });
});
