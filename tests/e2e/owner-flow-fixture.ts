import type { Page, Route } from "@playwright/test";

import deadlineModeManifest from "../../content/packs/deadline-mode-v1.json" with { type: "json" };
import manifest from "../../content/packs/old-friend-v1.json" with { type: "json" };

export const playId = "18181818-1818-4181-8181-181818181818";

type Choice = "a" | "b";
type Answer = { cardId: string; choice: Choice };
type OwnerState = {
  id: string;
  packSlug: string;
  packVersion: string;
  status: "draft" | "completed";
  currentPosition: number;
  answers: Answer[];
  managementExpiresAt: string;
  managementTtlSeconds: number;
};

export type ApiCall = Readonly<{
  method: string;
  pathname: string;
  body?: unknown;
}>;

export type OwnerFlowApi = {
  calls: ApiCall[];
  state: OwnerState;
  failSaveCount: number;
  saveDelayMs: number;
  incompleteCompleteCount: number;
  incompleteAnswerCount: number | null;
  readMissingCount: number;
};

const pack = {
  slug: manifest.slug,
  version: manifest.version,
  title: manifest.title,
  targetRelationship: manifest.targetRelationship,
  sensitivity: manifest.sensitivity,
  cards: manifest.cards,
};

const deadlineModePack = {
  slug: deadlineModeManifest.slug,
  version: deadlineModeManifest.version,
  title: deadlineModeManifest.title,
  targetRelationship: deadlineModeManifest.targetRelationship,
  sensitivity: deadlineModeManifest.sensitivity,
  cards: deadlineModeManifest.cards,
};

const fixturePacks = {
  "old-friend": pack,
  "deadline-mode": deadlineModePack,
} as const;

type FixturePackSlug = keyof typeof fixturePacks;

function noStoreJson(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

function ownerError(
  route: Route,
  status: number,
  code: string,
  message: string,
) {
  return noStoreJson(route, status, { code, message });
}

export async function installOwnerFlowApi(
  page: Page,
  options: Partial<
    Pick<
      OwnerFlowApi,
      | "failSaveCount"
      | "saveDelayMs"
      | "incompleteCompleteCount"
      | "incompleteAnswerCount"
      | "readMissingCount"
    >
  > & { packSlug?: FixturePackSlug } = {},
): Promise<OwnerFlowApi> {
  const selectedPack = fixturePacks[options.packSlug ?? "old-friend"];
  const api: OwnerFlowApi = {
    calls: [],
    state: {
      id: playId,
      packSlug: selectedPack.slug,
      packVersion: selectedPack.version,
      status: "draft",
      currentPosition: 1,
      answers: [],
      managementExpiresAt: "2026-07-25T00:00:00Z",
      managementTtlSeconds: 604800,
    },
    failSaveCount: options.failSaveCount ?? 0,
    saveDelayMs: options.saveDelayMs ?? 0,
    incompleteCompleteCount: options.incompleteCompleteCount ?? 0,
    incompleteAnswerCount: options.incompleteAnswerCount ?? null,
    readMissingCount: options.readMissingCount ?? 0,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON() as unknown;
    api.calls.push({ method, pathname: url.pathname, body });

    if (method === "POST" && url.pathname === "/api/plays") {
      return noStoreJson(
        route,
        api.state.answers.length === 0 ? 201 : 200,
        api.state,
      );
    }
    if (method === "GET" && url.pathname === `/api/plays/${playId}`) {
      if (api.readMissingCount > 0) {
        api.readMissingCount -= 1;
        return ownerError(
          route,
          404,
          "OWNER_PLAY_NOT_FOUND",
          "진행 중인 팩을 찾을 수 없습니다.",
        );
      }
      return noStoreJson(route, 200, api.state);
    }
    if (
      method === "GET" &&
      url.pathname === `/api/packs/${selectedPack.slug}`
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(selectedPack),
      });
    }
    const save = url.pathname.match(
      new RegExp(`^/api/plays/${playId}/answers/([a-z0-9-]+)$`),
    );
    if (method === "PUT" && save) {
      if (api.saveDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, api.saveDelayMs));
      }
      if (api.failSaveCount > 0) {
        api.failSaveCount -= 1;
        return ownerError(
          route,
          500,
          "INTERNAL_ERROR",
          "요청을 처리하지 못했습니다.",
        );
      }
      const input = body as { choice: Choice; currentPosition: number };
      const existing = new Map(
        api.state.answers.map((answer) => [answer.cardId, answer.choice]),
      );
      existing.set(save[1], input.choice);
      api.state.answers = selectedPack.cards
        .filter((card) => existing.has(card.id))
        .map((card) => ({
          cardId: card.id,
          choice: existing.get(card.id) as Choice,
        }));
      api.state.currentPosition = input.currentPosition;
      return noStoreJson(route, 200, api.state);
    }
    if (method === "POST" && url.pathname === `/api/plays/${playId}/complete`) {
      if (api.incompleteCompleteCount > 0) {
        api.incompleteCompleteCount -= 1;
        if (api.incompleteAnswerCount !== null) {
          api.state.answers = api.state.answers.slice(
            0,
            api.incompleteAnswerCount,
          );
          api.state.currentPosition = Math.min(
            api.incompleteAnswerCount + 1,
            selectedPack.cards.length,
          );
        }
        return ownerError(
          route,
          409,
          "OWNER_PLAY_INCOMPLETE",
          "모든 질문에 답한 뒤 완료해 주세요.",
        );
      }
      if (api.state.answers.length !== 10) {
        return ownerError(
          route,
          409,
          "OWNER_PLAY_INCOMPLETE",
          "모든 질문에 답한 뒤 완료해 주세요.",
        );
      }
      api.state.status = "completed";
      return noStoreJson(route, 200, api.state);
    }
    if (method === "DELETE" && url.pathname === "/api/me/session") {
      api.state.status = "draft";
      api.state.currentPosition = 1;
      api.state.answers = [];
      return route.fulfill({
        status: 204,
        headers: { "cache-control": "private, no-store" },
      });
    }
    return ownerError(
      route,
      404,
      "OWNER_PLAY_NOT_FOUND",
      "진행 중인 팩을 찾을 수 없습니다.",
    );
  });

  return api;
}

export async function openOwnerFlow(page: Page, api?: OwnerFlowApi) {
  const fixture = api ?? (await installOwnerFlowApi(page));
  await page.goto("/play/new?pack=old-friend");
  await page.waitForURL(`/play/${playId}`);
  await page
    .getByRole("heading", { name: "서운한 일이 생기면 나는?" })
    .waitFor();
  return fixture;
}
