import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:54324";
const defaultOwnerNickname = "겹친구09";

type MailpitMessage = {
  ID?: string;
  Id?: string;
  id?: string;
};

function messageId(message: MailpitMessage) {
  return message.ID ?? message.Id ?? message.id ?? null;
}

async function latestMagicLink(email: string) {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok) return null;
  const mailbox = (await response.json()) as { messages?: MailpitMessage[] };
  const message = mailbox.messages?.find((candidate) =>
    JSON.stringify(candidate).toLowerCase().includes(email.toLowerCase()),
  );
  const id = message ? messageId(message) : null;
  if (!id) return null;

  const detailResponse = await fetch(`${mailpitUrl}/api/v1/message/${id}`);
  if (!detailResponse.ok) return null;
  const messageDetail = (await detailResponse.json()) as {
    HTML?: string;
    Text?: string;
  };
  const detail =
    `${messageDetail.HTML ?? ""}\n${messageDetail.Text ?? ""}`.replaceAll(
      "&amp;",
      "&",
    );
  return (
    detail
      .match(/https?:\/\/[^\\s\"'<>]+/g)
      ?.map((candidate) => candidate.replaceAll("\\u0026", "&"))
      .find((candidate) => candidate.includes("/auth/v1/verify")) ?? null
  );
}

export async function verifyGoogleOAuthStart(page: Page) {
  const googleLink = page.getByRole("link", {
    name: "Google로 계속하기",
  });
  await expect(googleLink).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const href = await googleLink.getAttribute("href");
  expect(href).toMatch(/^\/auth\/google\?/);

  const signInUrl = page.url();
  await googleLink.click();
  await page.waitForURL(/\/auth\/v1\/authorize\?/);
  const authorize = new URL(page.url());
  expect(authorize.pathname).toBe("/auth/v1/authorize");
  expect(authorize.searchParams.get("provider")).toBe("google");
  expect(authorize.searchParams.get("redirect_to")).toBe(
    new URL("/auth/callback", signInUrl).toString(),
  );
  await page.goto(signInUrl);
  const authCookies = await page.context().cookies();
  expect(
    authCookies.some((cookie) => cookie.name === "__Secure-gyeop-owner-claim"),
  ).toBe(true);
  expect(
    authCookies.some((cookie) => cookie.name.endsWith("-code-verifier")),
  ).toBe(true);
}

async function submitTestMagicLink(
  page: Page,
  input: { email: string; playId: string | null; returnTo: string },
) {
  await verifyGoogleOAuthStart(page);
  const result = await page.evaluate(async (body) => {
    const response = await fetch("/api/auth/test-magic-link", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
    };
  }, input);
  expect(result).toEqual({ status: 202, cacheControl: "private, no-store" });

  const authCookies = await page.context().cookies();
  expect(
    authCookies.some((cookie) => cookie.name === "__Secure-gyeop-owner-claim"),
  ).toBe(true);
  expect(
    authCookies.some((cookie) => cookie.name.endsWith("-code-verifier")),
  ).toBe(true);

  let magicLink: string | null = null;
  await expect
    .poll(async () => {
      magicLink = await latestMagicLink(input.email);
      return magicLink;
    })
    .not.toBeNull();
  await page.goto(magicLink!, { waitUntil: "domcontentloaded" });
}

async function expectIncompleteProfile(
  page: Page,
  input: { email: string; returnTo: string },
) {
  await expect(page).toHaveURL((url) => {
    const entries = [...url.searchParams.entries()];
    return (
      url.pathname === "/auth/complete-profile" &&
      entries.length === 1 &&
      entries[0]?.[0] === "returnTo" &&
      entries[0]?.[1] === input.returnTo
    );
  });
  await expect(
    page.getByRole("heading", {
      name: "초대장에 쓸 이름을 알려 주세요",
    }),
  ).toBeVisible();
  const nickname = page.getByRole("textbox", {
    name: "친구에게 보일 닉네임",
  });
  await expect(nickname).toBeFocused();
  await expect(nickname).toHaveValue("");
  await expect(page.locator("body")).not.toContainText(input.email);
  return nickname;
}

async function completeOwnerProfile(
  page: Page,
  input: { email: string; nickname?: string; returnTo: string },
) {
  const nicknameValue = input.nickname ?? defaultOwnerNickname;
  const nickname = await expectIncompleteProfile(page, input);
  await nickname.fill(nicknameValue);
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === "/api/me/account-profile",
  );
  await page.getByRole("button", { name: "닉네임 저장" }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.request().postDataJSON()).toEqual({
    nickname: nicknameValue,
  });
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === input.returnTo && url.search === "" && url.hash === ""
    );
  });
  return nicknameValue;
}

export async function claimCompletedOwnerAccount(page: Page) {
  await page
    .getByRole("button", { name: "내 질문팩 저장하고 공유하기" })
    .click();
  await expect(
    page.getByRole("heading", { name: "내 질문팩을 계정에 저장해요" }),
  ).toBeFocused();

  const email = `gyeop-e2e-${randomUUID()}@example.com`;
  const signInUrl = new URL(page.url());
  const playId = signInUrl.searchParams.get("playId");
  expect(playId).toMatch(/^[0-9a-f-]{36}$/);
  if (!playId) throw new Error("Missing owner play sign-in target");
  await submitTestMagicLink(page, {
    email,
    playId,
    returnTo: `/me/plays/${playId}`,
  });
  const nickname = await completeOwnerProfile(page, {
    email,
    returnTo: `/me/plays/${playId}`,
  });
  await expect(page).toHaveURL(/\/me\/plays\/[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  const claimedPlayId = page.url().split("/").at(-1)!;
  return { email, nickname, playId: claimedPlayId };
}

export async function claimCompletedOwner(page: Page) {
  return (await claimCompletedOwnerAccount(page)).playId;
}

export async function signInOwnerAccount(
  page: Page,
  email: string,
  options: { profile?: "existing" | "new" } = {},
) {
  await page.goto("/auth/sign-in?returnTo=%2Fme");
  await expect(
    page.getByRole("heading", { name: "내 질문팩 불러오기" }),
  ).toBeFocused();
  let visitedCompleteProfile = false;
  const observeCompleteProfile = (request: { url(): string }) => {
    if (new URL(request.url()).pathname === "/auth/complete-profile") {
      visitedCompleteProfile = true;
    }
  };
  page.on("request", observeCompleteProfile);
  try {
    await submitTestMagicLink(page, { email, playId: null, returnTo: "/me" });
    if (options.profile === "new") {
      await completeOwnerProfile(page, { email, returnTo: "/me" });
      expect(visitedCompleteProfile).toBe(true);
    } else {
      expect(visitedCompleteProfile).toBe(false);
    }
  } finally {
    page.off("request", observeCompleteProfile);
  }
  await expect(page).toHaveURL(/\/me$/);
  const ownerListHeading = page.getByRole("heading", {
    name: /의 겹$/,
    level: 1,
  });
  if (options.profile === "new") {
    await expect(ownerListHeading).toBeVisible();
  } else {
    await expect(ownerListHeading).toBeFocused();
  }
}

export async function verifyIncompleteOwnerProfileGate(page: Page) {
  const email = `gyeop-incomplete-${randomUUID()}@example.com`;
  await page.goto("/auth/sign-in?returnTo=%2Fme");
  await submitTestMagicLink(page, { email, playId: null, returnTo: "/me" });
  await expectIncompleteProfile(page, { email, returnTo: "/me" });

  await page.goto("/me");
  await expectIncompleteProfile(page, { email, returnTo: "/me" });
  await completeOwnerProfile(page, { email, returnTo: "/me" });
  await expect(
    page.getByRole("heading", { name: `${defaultOwnerNickname}의 겹` }),
  ).toBeVisible();
}
