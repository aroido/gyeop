import "server-only";

import { startResponse, type StartResponseResult } from "../db/internal-rpc.ts";
import type { ParsedVisitorResponseCookie } from "./visitor-response-session.ts";
import { createVisitorResponseCredential } from "./visitor-session-core.mjs";

type Existing = Extract<ParsedVisitorResponseCookie, { outcome: "valid" }>;

export type VisitorSessionResult =
  | Readonly<{ outcome: "rate_limited"; retryAfterSeconds: number }>
  | Readonly<{
      outcome: "no_session" | "session_invalid" | "unavailable";
    }>
  | Readonly<{
      outcome: "created" | "resumed";
      response: Extract<
        StartResponseResult,
        { outcome: "created" | "resumed" }
      >["response"];
      cookieValue: string;
    }>;

function existingInput(existing: Existing | undefined) {
  return existing
    ? {
        responseId: existing.responseId,
        sessionTokenHash: existing.sessionTokenHash,
      }
    : undefined;
}

export async function resumeVisitorResponseSession(input: {
  publicId: string;
  secretHash: Uint8Array;
  existing?: Existing;
  rateLimitKey: Uint8Array;
  signal?: AbortSignal;
}): Promise<VisitorSessionResult> {
  const result = await startResponse({
    publicId: input.publicId,
    secretHash: input.secretHash,
    intent: "resume",
    existing: existingInput(input.existing),
    rateLimitKey: input.rateLimitKey,
    signal: input.signal,
  });
  if (result.outcome === "rate_limited") {
    return Object.freeze({
      outcome: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
  if (
    result.outcome === "no_session" ||
    result.outcome === "session_invalid" ||
    result.outcome === "unavailable"
  ) {
    return Object.freeze({ outcome: result.outcome });
  }
  if (result.outcome !== "resumed") {
    throw new Error("Internal visitor response RPC failed");
  }
  if (!input.existing) throw new Error("Internal visitor response RPC failed");
  return Object.freeze({
    outcome: "resumed",
    response: result.response,
    cookieValue: input.existing.value,
  });
}

export async function startVisitorResponseSession(input: {
  publicId: string;
  secretHash: Uint8Array;
  existing?: Existing;
  relationshipCode: string;
  knownSinceCode: string;
  rateLimitKey: Uint8Array;
  signal?: AbortSignal;
}): Promise<VisitorSessionResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const credential = createVisitorResponseCredential();
    const result = await startResponse({
      publicId: input.publicId,
      secretHash: input.secretHash,
      intent: "start",
      existing: existingInput(input.existing),
      created: {
        responseId: credential.responseId,
        sessionTokenHash: credential.sessionTokenHash,
        relationshipCode: input.relationshipCode,
        knownSinceCode: input.knownSinceCode,
      },
      rateLimitKey: input.rateLimitKey,
      signal: input.signal,
    });
    if (result.outcome === "collision") continue;
    if (result.outcome === "created") {
      return Object.freeze({
        outcome: "created",
        response: result.response,
        cookieValue: credential.value,
      });
    }
    if (result.outcome === "resumed") {
      if (!input.existing) {
        throw new Error("Internal visitor response RPC failed");
      }
      return Object.freeze({
        outcome: "resumed",
        response: result.response,
        cookieValue: input.existing.value,
      });
    }
    if (
      result.outcome === "no_session" ||
      result.outcome === "session_invalid" ||
      result.outcome === "unavailable"
    ) {
      return Object.freeze({ outcome: result.outcome });
    }
    if (result.outcome === "rate_limited") {
      return Object.freeze({
        outcome: "rate_limited",
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
    throw new Error("Internal visitor response RPC failed");
  }
  throw new Error("Internal visitor response RPC failed");
}
