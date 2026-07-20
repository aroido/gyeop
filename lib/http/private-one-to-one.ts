import "server-only";

import {
  getAuthenticatedPrivateOneToOneComparison,
  listAuthenticatedOwnerOneToOneResponses,
} from "../db/internal-rpc.ts";
import { errorResponse } from "./errors.ts";
import { authenticatedOwnerFailureResponse } from "./auth-errors.ts";
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
  let result;
  try {
    result = await listAuthenticatedOwnerOneToOneResponses({
      playId: input.playId,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "listed") return failure(result.outcome);
  return privateNoStore(Response.json({ responses: result.responses }));
}

export async function readPrivateOneToOneComparisonResponse(input: {
  playId: string;
  responseId: string;
  signal: AbortSignal;
}) {
  let result;
  try {
    result = await getAuthenticatedPrivateOneToOneComparison({
      playId: input.playId,
      responseId: input.responseId,
    });
  } catch (error) {
    return authenticatedOwnerFailureResponse(error);
  }
  if (result.outcome !== "authorized") return failure(result.outcome);
  return privateNoStore(Response.json(result.comparison));
}
