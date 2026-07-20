import "server-only";

import {
  completeAuthenticatedOwnerPlay,
  completeOwnerPlay,
  createOrResumeOwnerPlay,
  getAuthenticatedOwnerPlay,
  getOwnerPlay,
  revokeOwnerPlaySession,
  saveAuthenticatedOwnerAnswer,
  saveOwnerAnswer,
} from "../db/internal-rpc.ts";
import {
  createOwnerCredential,
  serializeDeletedOwnerCookie,
  serializeOwnerCookie,
} from "../owner-play/owner-play-session-core.mjs";
import type {
  OwnerPlayState,
  ParsedOwnerCookie,
} from "../owner-play/owner-play-session.ts";
import {
  authenticatedOwnerFailureResponse,
  isOwnerAuthenticationUnavailable,
} from "./auth-errors.ts";
import { errorResponse } from "./errors.ts";

const PACK_NOT_FOUND = Object.freeze({
  code: "PACK_NOT_FOUND",
  message: "팩을 찾을 수 없습니다.",
});
const OWNER_NOT_FOUND = Object.freeze({
  code: "OWNER_PLAY_NOT_FOUND",
  message: "진행 중인 팩을 찾을 수 없습니다.",
});
const OWNER_INCOMPLETE = Object.freeze({
  code: "OWNER_PLAY_INCOMPLETE",
  message: "모든 질문에 답한 뒤 완료해 주세요.",
});
const OWNER_COMPLETED = Object.freeze({
  code: "OWNER_PLAY_COMPLETED",
  message: "완료한 답변은 변경할 수 없습니다.",
});

type ValidOwnerCookie = Extract<ParsedOwnerCookie, { outcome: "valid" }>;

export function privateNoStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function ownerJson(value: unknown, status = 200) {
  return privateNoStore(Response.json(value, { status }));
}

export function refreshOwnerCookie(
  response: Response,
  cookieValue: string,
  management: Readonly<{
    managementTtlSeconds: number;
    managementExpiresAt: string;
  }>,
) {
  response.headers.set(
    "Set-Cookie",
    serializeOwnerCookie(
      cookieValue,
      management.managementTtlSeconds,
      management.managementExpiresAt,
    ),
  );
  return response;
}

function setOwnerCookie(
  response: Response,
  cookieValue: string,
  play: OwnerPlayState,
) {
  return refreshOwnerCookie(response, cookieValue, play);
}

export function ownerNotFoundResponse(deleteCookie = false) {
  const response = ownerJson(OWNER_NOT_FOUND, 404);
  if (deleteCookie) {
    response.headers.set("Set-Cookie", serializeDeletedOwnerCookie());
  }
  return response;
}

export function ownerLogoutResponse() {
  const response = privateNoStore(new Response(null, { status: 204 }));
  response.headers.set("Set-Cookie", serializeDeletedOwnerCookie());
  return response;
}

export function ownerRateLimitResponse(retryAfterSeconds: number) {
  return privateNoStore(errorResponse("RATE_LIMITED", retryAfterSeconds));
}

export function ownerInternalErrorResponse() {
  return privateNoStore(errorResponse("INTERNAL_ERROR"));
}

export async function createOwnerPlayResponse(input: {
  packSlug: string;
  networkKey: Uint8Array;
  entrySource: "home" | "same_pack_cta";
  sourceResponse?: Readonly<{
    responseId: string;
    sessionTokenHash: Uint8Array;
  }>;
  signal: AbortSignal;
}) {
  const credential = createOwnerCredential();
  const result = await createOrResumeOwnerPlay({
    packSlug: input.packSlug,
    created: {
      playId: credential.playId,
      managementSecretHash: credential.managementSecretHash,
    },
    networkKey: input.networkKey,
    entrySource: input.entrySource,
    sourceResponse: input.sourceResponse,
    signal: input.signal,
  });
  if (result.outcome === "created") {
    return setOwnerCookie(
      ownerJson(result.play, 201),
      credential.value,
      result.play,
    );
  }
  if (result.outcome === "rate_limited") {
    return ownerRateLimitResponse(result.retryAfterSeconds);
  }
  if (result.outcome === "pack_not_found") {
    return ownerJson(PACK_NOT_FOUND, 404);
  }
  return ownerInternalErrorResponse();
}

export async function resumeOwnerPlayResponse(input: {
  packSlug: string;
  cookie: ValidOwnerCookie;
  networkKey: Uint8Array;
  entrySource: "home" | "same_pack_cta";
  sourceResponse?: Readonly<{
    responseId: string;
    sessionTokenHash: Uint8Array;
  }>;
  signal: AbortSignal;
}) {
  const result = await createOrResumeOwnerPlay({
    packSlug: input.packSlug,
    existing: {
      playId: input.cookie.playId,
      managementSecretHash: input.cookie.managementSecretHash,
    },
    networkKey: input.networkKey,
    entrySource: "home",
    signal: input.signal,
  });
  if (result.outcome === "resumed") {
    return setOwnerCookie(
      ownerJson(result.play),
      input.cookie.value,
      result.play,
    );
  }
  if (result.outcome === "created") {
    return setOwnerCookie(
      ownerJson(result.play, 201),
      input.cookie.value,
      result.play,
    );
  }
  if (result.outcome === "expired" || result.outcome === "not_found") {
    return createOwnerPlayResponse({
      packSlug: input.packSlug,
      networkKey: input.networkKey,
      entrySource: input.entrySource,
      sourceResponse: input.sourceResponse,
      signal: input.signal,
    });
  }
  if (result.outcome === "wrong_pack") {
    const existing = await getOwnerPlay({
      playId: input.cookie.playId,
      managementSecretHash: input.cookie.managementSecretHash,
      signal: input.signal,
    });
    if (
      existing.outcome === "authorized" &&
      existing.play.status === "draft" &&
      existing.play.answers.length === 0
    ) {
      return createOwnerPlayResponse({
        packSlug: input.packSlug,
        networkKey: input.networkKey,
        entrySource: input.entrySource,
        sourceResponse: input.sourceResponse,
        signal: input.signal,
      });
    }
    return ownerNotFoundResponse();
  }
  return ownerInternalErrorResponse();
}

export async function readOwnerPlayResponse(input: {
  cookie: ValidOwnerCookie;
  playId: string;
  signal: AbortSignal;
}) {
  const result = await getOwnerPlay({
    playId: input.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  if (result.outcome === "authorized") {
    return setOwnerCookie(
      ownerJson(result.play),
      input.cookie.value,
      result.play,
    );
  }
  try {
    const authenticated = await getAuthenticatedOwnerPlay({
      playId: input.playId,
    });
    return authenticated.outcome === "authorized"
      ? ownerJson(authenticated.play)
      : ownerNotFoundResponse(true);
  } catch (error) {
    return isOwnerAuthenticationUnavailable(error)
      ? ownerNotFoundResponse(true)
      : authenticatedOwnerFailureResponse(error);
  }
}

export async function saveOwnerAnswerResponse(input: {
  cookie: ValidOwnerCookie;
  playId: string;
  cardId: string;
  choice: "a" | "b";
  currentPosition: number;
  signal: AbortSignal;
}) {
  const result = await saveOwnerAnswer({
    playId: input.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    cardId: input.cardId,
    choice: input.choice,
    currentPosition: input.currentPosition,
    signal: input.signal,
  });
  if (result.outcome === "saved") {
    return setOwnerCookie(
      ownerJson(result.play),
      input.cookie.value,
      result.play,
    );
  }
  if (result.outcome === "completed") {
    return setOwnerCookie(
      ownerJson(OWNER_COMPLETED, 409),
      input.cookie.value,
      result.play,
    );
  }
  if (result.outcome === "invalid_card") return ownerNotFoundResponse();
  const authenticated = await saveAuthenticatedOwnerAnswerResponse({
    playId: input.playId,
    cardId: input.cardId,
    choice: input.choice,
    currentPosition: input.currentPosition,
  });
  return authenticated.status === 401
    ? ownerNotFoundResponse(true)
    : authenticated;
}

export async function saveAuthenticatedOwnerAnswerResponse(input: {
  playId: string;
  cardId: string;
  choice: "a" | "b";
  currentPosition: number;
}) {
  let result;
  try {
    result = await saveAuthenticatedOwnerAnswer(input);
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome === "saved") return ownerJson(result.play);
  if (result.outcome === "completed") {
    return ownerJson(OWNER_COMPLETED, 409);
  }
  return ownerNotFoundResponse();
}

export async function completeOwnerPlayResponse(input: {
  cookie: ValidOwnerCookie;
  playId: string;
  signal: AbortSignal;
}) {
  const result = await completeOwnerPlay({
    playId: input.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  if (result.outcome === "completed") {
    return setOwnerCookie(
      ownerJson(result.play),
      input.cookie.value,
      result.play,
    );
  }
  if (result.outcome === "incomplete") {
    return setOwnerCookie(
      ownerJson(OWNER_INCOMPLETE, 409),
      input.cookie.value,
      result.play,
    );
  }
  const authenticated = await completeAuthenticatedOwnerPlayResponse({
    playId: input.playId,
  });
  return authenticated.status === 401
    ? ownerNotFoundResponse(true)
    : authenticated;
}

export async function completeAuthenticatedOwnerPlayResponse(input: {
  playId: string;
}) {
  let result;
  try {
    result = await completeAuthenticatedOwnerPlay(input);
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome === "completed") return ownerJson(result.play);
  if (result.outcome === "incomplete") {
    return ownerJson(OWNER_INCOMPLETE, 409);
  }
  return ownerNotFoundResponse();
}

export async function revokeOwnerPlayResponse(input: {
  cookie: ValidOwnerCookie;
  signal: AbortSignal;
}) {
  await revokeOwnerPlaySession({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  return ownerLogoutResponse();
}
