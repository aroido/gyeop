import { expect, test, type Page, type Route } from "@playwright/test";

import { installOwnerFlowApi, playId } from "./owner-flow-fixture";

const secret = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const publicIds = [
  "AAAAAAAAAAAAAAAAAAAAAA",
  "AQEBAQEBAQEBAQEBAQEBAQ",
  "AgICAgICAgICAgICAgICAg",
];
const linkIds = [
  "19100000-0000-4000-8000-000000000001",
  "19100000-0000-4000-8000-000000000002",
  "19100000-0000-4000-8000-000000000003",
];
const cardIds = [
  "conflict",
  "reunion",
  "plans",
  "comfort",
  "gathering",
  "reconnect",
  "memory",
  "travel",
  "celebration",
  "hard-day",
];

type LinkState = {
  id: string;
  publicId: string;
  kind: "public" | "one_to_one";
  status: "active" | "disabled";
  expiresAt: null;
  consumedAt: null;
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function installShareApi(page: Page) {
  const links: LinkState[] = [];
  const calls: { method: string; pathname: string; body?: unknown }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (
      !url.pathname.includes("/links") &&
      !url.pathname.includes("/invites/")
    ) {
      return route.fallback();
    }
    calls.push({ method, pathname: url.pathname, body });
    if (method === "GET" && url.pathname === `/api/me/plays/${playId}/links`) {
      return json(route, 200, { links });
    }
    if (method === "POST" && url.pathname === `/api/plays/${playId}/links`) {
      const kind = (body as { kind: "public" | "one_to_one" }).kind;
      const index = links.length;
      const link: LinkState = {
        id: linkIds[index],
        publicId: publicIds[index],
        kind,
        status: "active",
        expiresAt: null,
        consumedAt: null,
      };
      links.unshift(link);
      return json(route, 201, {
        link,
        inviteUrl: `http://127.0.0.1:3000/i/${link.publicId}#k=${secret}`,
      });
    }
    const rotate = url.pathname.match(
      /^\/api\/links\/([0-9a-f-]{36})\/rotate$/,
    );
    if (method === "POST" && rotate) {
      const old = links.find((link) => link.id === rotate[1]);
      if (!old || old.status !== "active") {
        return json(route, 409, {
          code: "SHARE_LINK_NOT_ACTIVE",
          message: "링크 상태가 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.",
        });
      }
      old.status = "disabled";
      const index = links.length;
      const link: LinkState = {
        ...old,
        id: linkIds[index],
        publicId: publicIds[index],
        status: "active",
      };
      links.unshift(link);
      return json(route, 201, {
        link,
        inviteUrl: `http://127.0.0.1:3000/i/${link.publicId}#k=${secret}`,
      });
    }
    const disable = url.pathname.match(/^\/api\/links\/([0-9a-f-]{36})$/);
    if (method === "PATCH" && disable) {
      const link = links.find((candidate) => candidate.id === disable[1]);
      if (!link)
        return json(route, 404, {
          code: "OWNER_PLAY_NOT_FOUND",
          message: "진행 중인 팩을 찾을 수 없습니다.",
        });
      link.status = "disabled";
      return json(route, 200, { link });
    }
    if (method === "POST" && url.pathname.startsWith("/api/invites/")) {
      return json(route, 200, {
        packSlug: "old-friend",
        packVersion: "old-friend-v1",
        packTitle: "오래된 친구팩",
        kind: "public",
      });
    }
    return route.fallback();
  });
  return { links, calls };
}

async function completedOwner(page: Page) {
  const owner = await installOwnerFlowApi(page);
  owner.state.status = "completed";
  owner.state.answers = cardIds.map((cardId) => ({ cardId, choice: "a" }));
  owner.state.currentPosition = 10;
  return owner;
}

test("creates the recommended public link and loses the raw URL on reload", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);

  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  await expect(
    page.getByRole("radio", { name: /여러 친구에게 공개/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(page.getByText("공유 링크가 준비됐어요")).toBeVisible();
  await expect(page.locator("code")).toContainText(`#k=${secret}`);
  expect(
    share.calls.find(
      (call) => call.pathname.endsWith("/links") && call.method === "POST",
    )?.body,
  ).toEqual({ kind: "public" });

  await page.reload();
  await expect(page.locator("code")).toHaveCount(0);
  await expect(page.getByText("사용 중")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("creates a one-to-one link, rotates it, and disables the replacement", async ({
  page,
}) => {
  await completedOwner(page);
  await installShareApi(page);
  await page.goto(`/me/plays/${playId}`);
  await page.getByRole("radio", { name: /한 친구에게 1:1/ }).check();
  await page.getByRole("button", { name: "공유 링크 만들기" }).click();
  await expect(page.getByText("1:1 친구")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "새로 발급" }).click();
  await expect(page.getByText("공유 링크가 준비됐어요")).toBeVisible();
  await expect(page.getByText("비활성", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "비활성화" }).click();
  await expect(page.locator("code")).toHaveCount(0);
  await expect(page.getByText("사용 중")).toHaveCount(0);
});

test("reads only an exact fragment and renders generic invite states", async ({
  page,
}) => {
  await completedOwner(page);
  const share = await installShareApi(page);
  await page.goto(`/i/${publicIds[0]}#k=${secret}`);
  await expect(
    page.getByRole("heading", { name: "친구가 먼저 답한 질문팩이에요" }),
  ).toBeFocused();
  await expect(page.getByText("여러 친구가 함께 참여")).toBeVisible();

  const inviteCalls = () =>
    share.calls.filter((call) => call.pathname.includes("/invites/"));
  expect(inviteCalls()).toHaveLength(1);
  await page.goto(`/i/${publicIds[0]}#k=${secret}&x=1`);
  await expect(
    page.getByRole("heading", { name: "이 초대는 지금 참여할 수 없어요" }),
  ).toBeFocused();
  expect(inviteCalls()).toHaveLength(1);
});
