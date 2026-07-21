import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

const mailpitUrl = "http://127.0.0.1:54324";

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
  await expect(page).toHaveURL(/\/me\/plays\/[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  const claimedPlayId = page.url().split("/").at(-1)!;
  return { email, playId: claimedPlayId };
}

export async function claimCompletedOwner(page: Page) {
  return (await claimCompletedOwnerAccount(page)).playId;
}

export async function signInOwnerAccount(page: Page, email: string) {
  await page.goto("/auth/sign-in?returnTo=%2Fme");
  await expect(
    page.getByRole("heading", { name: "내 질문팩 불러오기" }),
  ).toBeFocused();
  await submitTestMagicLink(page, { email, playId: null, returnTo: "/me" });
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole("heading", { name: "저장한 질문팩" }),
  ).toBeFocused();
}
