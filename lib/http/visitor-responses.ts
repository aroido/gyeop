import "server-only";

import { hashShareSecret } from "../share-links/share-link-session-core.mjs";
import {
  serializeDeletedVisitorResponseCookie,
  serializeVisitorResponseCookie,
} from "../visitor-response/visitor-session-core.mjs";
import type { ParsedVisitorResponseCookie } from "../visitor-response/visitor-response-session.ts";
import {
  resumeVisitorResponseSession,
  startVisitorResponseSession,
} from "../visitor-response/visitor-responses.ts";
import { visitorResponseHttpState } from "../visitor-response/visitor-context-core.mjs";
import { inviteUnavailableResponse } from "./share-links.ts";
import { privateNoStore } from "./owner-play.ts";

type ValidCookie = Extract<ParsedVisitorResponseCookie, { outcome: "valid" }>;

const RATE_LIMITED = Object.freeze({
  code: "RATE_LIMITED",
  message: "잠시 후 다시 시도해 주세요.",
});

function deletedUnavailableResponse() {
  const response = inviteUnavailableResponse();
  response.headers.set("Set-Cookie", serializeDeletedVisitorResponseCookie());
  return response;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  const response = privateNoStore(Response.json(RATE_LIMITED, { status: 429 }));
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function visitorResponse(input: {
  publicId: string;
  secret: string;
  intent: "resume" | "start";
  cookie?: ValidCookie;
  relationshipCode?: string;
  knownSinceCode?: string;
  rateLimitKey: Uint8Array;
  signal: AbortSignal;
}) {
  const common = {
    publicId: input.publicId,
    secretHash: hashShareSecret(input.secret),
    existing: input.cookie,
    rateLimitKey: input.rateLimitKey,
    signal: input.signal,
  };
  const result =
    input.intent === "resume"
      ? await resumeVisitorResponseSession(common)
      : await startVisitorResponseSession({
          ...common,
          relationshipCode: input.relationshipCode!,
          knownSinceCode: input.knownSinceCode!,
        });

  if (result.outcome === "no_session") {
    return privateNoStore(new Response(null, { status: 204 }));
  }
  if (result.outcome === "rate_limited") {
    return rateLimitedResponse(result.retryAfterSeconds);
  }
  if (result.outcome === "unavailable") return inviteUnavailableResponse();
  if (result.outcome === "session_invalid") {
    return deletedUnavailableResponse();
  }
  if (result.outcome !== "created" && result.outcome !== "resumed") {
    throw new Error("INTERNAL_ERROR");
  }

  const serialized = serializeVisitorResponseCookie(
    result.cookieValue,
    result.response.sessionTtlSeconds,
    result.response.sessionExpiresAt,
  );
  if (serialized === null) return deletedUnavailableResponse();
  const response = privateNoStore(
    Response.json(visitorResponseHttpState(result.response), {
      status: result.outcome === "created" ? 201 : 200,
    }),
  );
  response.headers.set("Set-Cookie", serialized);
  return response;
}

export function malformedVisitorResponseCookie() {
  return deletedUnavailableResponse();
}
