import "server-only";

import {
  getAuthenticatedPrivateOneToOneComparison,
  listAuthenticatedOwnerOneToOneResponses,
} from "../db/internal-rpc.ts";
import { errorResponse } from "./errors.ts";
import { ownerNotFoundResponse, privateNoStore } from "./owner-play.ts";

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
  playId: string;
  signal: AbortSignal;
}) {
  const result = await listAuthenticatedOwnerOneToOneResponses({
    playId: input.playId,
  }).catch(() => null);
  if (!result) return ownerNotFoundResponse();
  if (result.outcome !== "listed") return failure(result.outcome);
  return privateNoStore(Response.json({ responses: result.responses }));
}

export async function readPrivateOneToOneComparisonResponse(input: {
  playId: string;
  responseId: string;
  signal: AbortSignal;
}) {
  const result = await getAuthenticatedPrivateOneToOneComparison({
    playId: input.playId,
    responseId: input.responseId,
  }).catch(() => null);
  if (!result) return ownerNotFoundResponse();
  if (result.outcome !== "authorized") return failure(result.outcome);
  return privateNoStore(Response.json(result.comparison));
}
