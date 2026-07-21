import type { OwnerPlayState } from "../owner-play/owner-play-session";
import {
  decodeOwnerPlayState,
  isOwnerPlayId,
} from "../owner-play/owner-play-state-core.mjs";
import { isOfficialPackSlug } from "../packs/official-pack-registry.mjs";
import { decodePublishedPack } from "../packs/published-pack-core.mjs";

const CARD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ERROR_CODES = new Set([
  "INTERNAL_ERROR",
  "INVALID_INPUT",
  "INVALID_ORIGIN",
  "INVALID_REQUEST",
  "OWNER_AUTH_REQUIRED",
  "OWNER_PLAY_COMPLETED",
  "OWNER_PLAY_INCOMPLETE",
  "OWNER_PLAY_NOT_FOUND",
  "PACK_NOT_FOUND",
  "RATE_LIMITED",
]);

export type OwnerPackCard = Readonly<{
  id: string;
  position: number;
  ownerPrompt: string;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
}>;

export type OwnerPack = Readonly<{
  slug: string;
  version: string;
  title: string;
  targetRelationship: string;
  sensitivity: string;
  cards: readonly OwnerPackCard[];
}>;

export class OwnerFlowHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super("Owner flow request failed");
    this.name = "OwnerFlowHttpError";
    this.status = status;
    this.code = code;
  }
}

function invalidResponse(status = 500): never {
  throw new OwnerFlowHttpError(status, "INVALID_RESPONSE");
}

function ensureOwnerNoStore(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    invalidResponse(response.status);
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    invalidResponse(response.status);
  }
}

async function ownerStateResponse(response: Response): Promise<OwnerPlayState> {
  ensureOwnerNoStore(response);
  const value = await responseJson(response);
  if (!response.ok) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join("\0") === "code\0message" &&
      typeof (value as { code?: unknown }).code === "string" &&
      typeof (value as { message?: unknown }).message === "string" &&
      ERROR_CODES.has((value as { code: string }).code)
    ) {
      throw new OwnerFlowHttpError(
        response.status,
        (value as { code: string }).code,
      );
    }
    invalidResponse(response.status);
  }
  try {
    return decodeOwnerPlayState(value) as OwnerPlayState;
  } catch {
    invalidResponse(response.status);
  }
}

function jsonRequest(method: "POST" | "PUT" | "DELETE", body: unknown) {
  return {
    method,
    cache: "no-store" as const,
    credentials: "same-origin" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function ownerPlayPath(playId: string) {
  if (!isOwnerPlayId(playId)) invalidResponse(400);
  return `/api/plays/${encodeURIComponent(playId)}`;
}

export function createOrResumeOwnerPlay(
  packSlug: string,
  entrySource: "home" | "same_pack_cta" = "home",
): Promise<OwnerPlayState> {
  if (!isOfficialPackSlug(packSlug)) invalidResponse(400);
  return fetch(
    "/api/plays",
    jsonRequest("POST", { packSlug, entrySource }),
  ).then(ownerStateResponse);
}

const bootstrapRequests = new Map<string, Promise<OwnerPlayState>>();

export function bootstrapOwnerPlay(
  packSlug: string,
  entrySource: "home" | "same_pack_cta",
): Promise<OwnerPlayState> {
  if (!isOfficialPackSlug(packSlug)) invalidResponse(400);
  const key = `${packSlug}\0${entrySource}`;
  const existing = bootstrapRequests.get(key);
  if (existing) return existing;
  const request = createOrResumeOwnerPlay(packSlug, entrySource);
  bootstrapRequests.set(key, request);
  const clear = () => {
    if (bootstrapRequests.get(key) === request) {
      bootstrapRequests.delete(key);
    }
  };
  void request.then(clear, clear);
  return request;
}

export function readOwnerPlay(playId: string): Promise<OwnerPlayState> {
  return fetch(ownerPlayPath(playId), {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  }).then(ownerStateResponse);
}

const ownerFlowLoads = new Map<
  string,
  Promise<{ play: OwnerPlayState; pack: OwnerPack }>
>();

export function loadOwnerFlow(
  playId: string,
): Promise<{ play: OwnerPlayState; pack: OwnerPack }> {
  if (!isOwnerPlayId(playId)) invalidResponse(400);
  const existing = ownerFlowLoads.get(playId);
  if (existing) return existing;
  const request = readOwnerPlay(playId).then(async (play) => ({
    play,
    pack: await readOwnerPack(play.packSlug),
  }));
  ownerFlowLoads.set(playId, request);
  const clear = () => {
    if (ownerFlowLoads.get(playId) === request) ownerFlowLoads.delete(playId);
  };
  void request.then(clear, clear);
  return request;
}

export async function readOwnerPack(packSlug: string): Promise<OwnerPack> {
  if (!isOfficialPackSlug(packSlug)) invalidResponse(400);
  const response = await fetch(`/api/packs/${encodeURIComponent(packSlug)}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  const value = await responseJson(response);
  if (!response.ok) invalidResponse(response.status);
  try {
    return decodePublishedPack(value) as OwnerPack;
  } catch {
    invalidResponse(response.status);
  }
}

export function saveOwnerAnswer(input: {
  playId: string;
  cardId: string;
  choice: "a" | "b";
  currentPosition: number;
}): Promise<OwnerPlayState> {
  if (!CARD_ID.test(input.cardId)) invalidResponse(400);
  return fetch(
    `${ownerPlayPath(input.playId)}/answers/${encodeURIComponent(input.cardId)}`,
    jsonRequest("PUT", {
      choice: input.choice,
      currentPosition: input.currentPosition,
    }),
  ).then(ownerStateResponse);
}

export function completeOwnerPlay(playId: string): Promise<OwnerPlayState> {
  return fetch(
    `${ownerPlayPath(playId)}/complete`,
    jsonRequest("POST", {}),
  ).then(ownerStateResponse);
}

export async function clearOwnerSession(): Promise<void> {
  const response = await fetch("/api/me/session", jsonRequest("DELETE", {}));
  ensureOwnerNoStore(response);
  if (response.status !== 204) invalidResponse(response.status);
}
