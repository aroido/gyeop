import "server-only";

import { hashShareSecret } from "../share-links/share-link-session-core.mjs";
import {
  serializeDeletedVisitorResponseCookie,
  serializeVisitorResponseCookie,
} from "../visitor-response/visitor-session-core.mjs";
import type { ParsedVisitorResponseCookie } from "../visitor-response/visitor-response-session.ts";
import {
  getVisitorResponseSession,
  recordVisitorEvent,
  resumeVisitorResponseSession,
  saveVisitorResponseAnswer,
  startVisitorResponseSession,
  submitVisitorResponse,
} from "../visitor-response/visitor-responses.ts";
import { visitorResponseHttpState } from "../visitor-response/visitor-context-core.mjs";
import { errorResponse } from "./errors.ts";
import { inviteUnavailableResponse } from "./share-links.ts";
import { privateNoStore } from "./owner-play.ts";

type ValidCookie = Extract<ParsedVisitorResponseCookie, { outcome: "valid" }>;

function deletedUnavailableResponse() {
  const response = inviteUnavailableResponse();
  response.headers.set("Set-Cookie", serializeDeletedVisitorResponseCookie());
  return response;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return privateNoStore(errorResponse("RATE_LIMITED", retryAfterSeconds));
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

export function visitorResponseMethodNotAllowed(allow: "GET" | "POST" | "PUT") {
  return privateNoStore(
    new Response(null, { status: 405, headers: { Allow: allow } }),
  );
}

function conflictResponse(
  code: "VISITOR_RESPONSE_CONFLICT" | "VISITOR_RESPONSE_INCOMPLETE",
) {
  return privateNoStore(
    Response.json(
      {
        code,
        message:
          code === "VISITOR_RESPONSE_INCOMPLETE"
            ? "세 질문에 모두 답한 뒤 결과를 확인해 주세요."
            : "이 응답을 더 이상 변경할 수 없어요.",
      },
      { status: 409 },
    ),
  );
}

function responseState(
  cookie: ValidCookie,
  value: unknown,
  sessionTtlSeconds: number,
  sessionExpiresAt: string,
) {
  const serialized = serializeVisitorResponseCookie(
    cookie.value,
    sessionTtlSeconds,
    sessionExpiresAt,
  );
  if (serialized === null) return deletedUnavailableResponse();
  const response = privateNoStore(
    Response.json(visitorResponseHttpState(value)),
  );
  response.headers.set("Set-Cookie", serialized);
  return response;
}

export async function readVisitorResponse(input: {
  cookie: ValidCookie;
  signal: AbortSignal;
}) {
  const result = await getVisitorResponseSession(input);
  if (result.outcome !== "authorized") return deletedUnavailableResponse();
  return responseState(
    input.cookie,
    result.response,
    result.response.sessionTtlSeconds,
    result.response.sessionExpiresAt,
  );
}

export async function saveVisitorAnswer(input: {
  cookie: ValidCookie;
  cardId: string;
  choice: "a" | "b";
  signal: AbortSignal;
}) {
  const result = await saveVisitorResponseAnswer(input);
  if (
    result.outcome === "session_invalid" ||
    result.outcome === "invalid_card"
  ) {
    return result.outcome === "session_invalid"
      ? deletedUnavailableResponse()
      : inviteUnavailableResponse();
  }
  if (result.outcome === "submitted") {
    return conflictResponse("VISITOR_RESPONSE_CONFLICT");
  }
  return responseState(
    input.cookie,
    result.response,
    result.response.sessionTtlSeconds,
    result.response.sessionExpiresAt,
  );
}

export async function submitVisitorAnswers(input: {
  cookie: ValidCookie;
  managementSecret: string;
  signal: AbortSignal;
}) {
  const result = await submitVisitorResponse(input);
  if (result.outcome === "session_invalid") return deletedUnavailableResponse();
  if (result.outcome === "incomplete") {
    return conflictResponse("VISITOR_RESPONSE_INCOMPLETE");
  }
  if (result.outcome === "conflict") {
    return conflictResponse("VISITOR_RESPONSE_CONFLICT");
  }
  return responseState(
    input.cookie,
    result.response,
    result.response.sessionTtlSeconds,
    result.response.sessionExpiresAt,
  );
}

export async function recordVisitorResponseScreenEvent(input: {
  cookie: ValidCookie;
  event: "comparison_viewed" | "same_pack_start_clicked";
  signal: AbortSignal;
}) {
  const result = await recordVisitorEvent(input);
  if (result.outcome !== "recorded") return deletedUnavailableResponse();
  return privateNoStore(new Response(null, { status: 204 }));
}
