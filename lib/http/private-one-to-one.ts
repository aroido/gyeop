import "server-only";

import {
  getPrivateOneToOneComparison,
  listOwnerOneToOneResponses,
} from "../db/internal-rpc.ts";
import type { ParsedOwnerCookie } from "../owner-play/owner-play-session.ts";
import { errorResponse } from "./errors.ts";
import {
  ownerNotFoundResponse,
  privateNoStore,
  refreshOwnerCookie,
} from "./owner-play.ts";

type OwnerCookie = Extract<ParsedOwnerCookie, { outcome: "valid" }>;

export function privateOneToOneInvalidRequest() {
  return privateNoStore(errorResponse("INVALID_REQUEST"));
}

export function privateOneToOneMethodNotAllowed() {
  return privateNoStore(
    new Response(null, { status: 405, headers: { Allow: "GET" } }),
  );
}

function failure(outcome: string) {
  if (outcome === "expired" || outcome === "not_found") {
    return ownerNotFoundResponse(true);
  }
  return ownerNotFoundResponse();
}

export async function listPrivateOneToOneResponsesResponse(input: {
  cookie: OwnerCookie;
  signal: AbortSignal;
}) {
  const result = await listOwnerOneToOneResponses({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    signal: input.signal,
  });
  if (result.outcome !== "listed") return failure(result.outcome);
  return refreshOwnerCookie(
    privateNoStore(Response.json({ responses: result.responses })),
    input.cookie.value,
    result,
  );
}

export async function readPrivateOneToOneComparisonResponse(input: {
  cookie: OwnerCookie;
  responseId: string;
  signal: AbortSignal;
}) {
  const result = await getPrivateOneToOneComparison({
    playId: input.cookie.playId,
    managementSecretHash: input.cookie.managementSecretHash,
    responseId: input.responseId,
    signal: input.signal,
  });
  if (result.outcome !== "authorized") return failure(result.outcome);
  return refreshOwnerCookie(
    privateNoStore(Response.json(result.comparison)),
    input.cookie.value,
    result,
  );
}
