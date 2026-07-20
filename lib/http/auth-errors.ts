import "server-only";

import { errorResponse } from "./errors.ts";

const AUTH_REQUIRED = Object.freeze({
  code: "OWNER_AUTH_REQUIRED",
  message: "로그인한 뒤 내 질문팩을 불러올 수 있어요.",
});

function privateNoStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function ownerAuthRequiredResponse() {
  return privateNoStore(Response.json(AUTH_REQUIRED, { status: 401 }));
}

export function isOwnerAuthenticationUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "Owner authentication is unavailable"
  );
}

export function authenticatedOwnerFailureResponse(error: unknown) {
  return isOwnerAuthenticationUnavailable(error)
    ? ownerAuthRequiredResponse()
    : privateNoStore(errorResponse("INTERNAL_ERROR"));
}
