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

async function submitMagicLink(page: Page, email: string) {
  await page.getByLabel("이메일").fill(email);
  await page.getByRole("button", { name: "로그인 링크 보내기" }).click();
  await expect(page.getByRole("status")).toContainText(
    "로그인 링크를 보냈어요",
  );
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
      magicLink = await latestMagicLink(email);
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
  await submitMagicLink(page, email);
  await expect(page).toHaveURL(/\/me\/plays\/[0-9a-f-]{36}$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "공유 링크" })).toBeFocused();
  const playId = page.url().split("/").at(-1)!;
  return { email, playId };
}

export async function claimCompletedOwner(page: Page) {
  return (await claimCompletedOwnerAccount(page)).playId;
}

export async function signInOwnerAccount(page: Page, email: string) {
  await page.goto("/auth/sign-in?returnTo=%2Fme");
  await expect(
    page.getByRole("heading", { name: "내 질문팩 불러오기" }),
  ).toBeFocused();
  await submitMagicLink(page, email);
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole("heading", { name: "저장한 질문팩" }),
  ).toBeFocused();
}
