import {
  decodeVisitorResponseHttpState,
  isKnownSinceCode,
  isRelationshipCode,
  isVisitorResponseId,
} from "./visitor-context-core.mjs";
import { isSharePublicId } from "../share-links/share-link-state-core.mjs";

const SECRET = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

type VisitorAssignmentBase = Readonly<{
  cardId: string;
  stage: "required" | "optional";
  position: 1 | 2 | 3;
  visitorPrompt: string;
  optionA: string;
  optionB: string;
  isSignature: boolean;
  visitorChoice: "a" | "b" | null;
}>;
type VisitorResponseBase = Readonly<{
  id: string;
  packSlug: string;
  packVersion: string;
  packTitle: string;
  relationshipCode: string;
  relationshipLabel: string;
  knownSinceCode: string;
  knownSinceLabel: string;
  sessionExpiresAt: string;
  sessionTtlSeconds: number;
}>;
export type VisitorResponse =
  | (VisitorResponseBase &
      Readonly<{
        status: "draft";
        assignments: readonly VisitorAssignmentBase[];
      }>)
  | (VisitorResponseBase &
      Readonly<{
        status: "submitted";
        allMatched: boolean;
        assignments: readonly Readonly<
          VisitorAssignmentBase & {
            packPosition: number;
            visitorChoice: "a" | "b" | null;
            ownerChoice: "a" | "b" | null;
            matches: boolean | null;
            isHighlight: boolean;
          }
        >[];
      }>);

export class VisitorResponseHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, retryAfterSeconds: number | null) {
    super("Visitor response request failed");
    this.name = "VisitorResponseHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function invalidInput(): never {
  throw new VisitorResponseHttpError(400, "INVALID_INPUT", null);
}

function request(body: unknown) {
  return {
    method: "POST",
    cache: "no-store" as const,
    credentials: "same-origin" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function mutation(method: "POST" | "PUT", body: unknown, keepalive = false) {
  return {
    method,
    cache: "no-store" as const,
    credentials: "same-origin" as const,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  };
}

function retryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (value === null || !/^[1-9][0-9]*$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

async function decodeError(response: Response): Promise<never> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  const record = value as { code?: unknown; message?: unknown };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== "code\0message" ||
    typeof record.code !== "string" ||
    typeof record.message !== "string"
  ) {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  const retry = response.status === 429 ? retryAfter(response) : null;
  if (response.status === 429 && retry === null) {
    throw new VisitorResponseHttpError(429, "INVALID_RESPONSE", null);
  }
  throw new VisitorResponseHttpError(response.status, record.code, retry);
}

async function send(
  publicId: string,
  intent: "resume" | "start",
  body: unknown,
) {
  const response = await fetch(
    `/api/invites/${encodeURIComponent(publicId)}/responses`,
    request(body),
  );
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  if (intent === "resume" && response.status === 204) return null;
  if (!response.ok) return decodeError(response);
  if (
    (intent === "resume" && response.status !== 200) ||
    (intent === "start" && response.status !== 200 && response.status !== 201)
  ) {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  try {
    return decodeVisitorResponseHttpState(value) as VisitorResponse;
  } catch {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
}

async function stateResponse(response: Response) {
  if (response.headers.get("cache-control") !== "private, no-store") {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  if (!response.ok) return decodeError(response);
  if (response.status !== 200) {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
  let value: unknown;
  try {
    value = await response.json();
    return decodeVisitorResponseHttpState(value) as VisitorResponse;
  } catch {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
}

const flights = new Map<string, Promise<VisitorResponse | null>>();

function singleFlight(
  publicId: string,
  intent: "resume" | "start",
  run: () => Promise<VisitorResponse | null>,
) {
  const key = `${publicId}\0${intent}`;
  const existing = flights.get(key);
  if (existing) return existing;
  const flight = run();
  flights.set(key, flight);
  const clear = () => {
    if (flights.get(key) === flight) flights.delete(key);
  };
  void flight.then(clear, clear);
  return flight;
}

function validateCommon(publicId: string, secret: string) {
  if (!isSharePublicId(publicId) || !SECRET.test(secret)) invalidInput();
}

export function resumeVisitorResponse(publicId: string, secret: string) {
  validateCommon(publicId, secret);
  return singleFlight(publicId, "resume", () =>
    send(publicId, "resume", { intent: "resume", secret }),
  );
}

export function startVisitorResponse(
  publicId: string,
  secret: string,
  relationshipCode: string,
  knownSinceCode: string,
) {
  validateCommon(publicId, secret);
  if (
    !isRelationshipCode(relationshipCode) ||
    !isKnownSinceCode(knownSinceCode)
  ) {
    invalidInput();
  }
  return singleFlight(publicId, "start", () =>
    send(publicId, "start", {
      intent: "start",
      secret,
      relationshipCode,
      knownSinceCode,
    }),
  ).then((response) => {
    if (response === null) {
      throw new VisitorResponseHttpError(204, "INVALID_RESPONSE", null);
    }
    return response;
  });
}

export function readVisitorResponse(responseId: string) {
  if (!isVisitorResponseId(responseId)) invalidInput();
  return fetch(`/api/responses/${encodeURIComponent(responseId)}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  }).then(stateResponse);
}

export function saveVisitorAnswer(
  responseId: string,
  cardId: string,
  choice: "a" | "b",
) {
  if (
    !isVisitorResponseId(responseId) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cardId) ||
    (choice !== "a" && choice !== "b")
  ) {
    invalidInput();
  }
  return fetch(
    `/api/responses/${encodeURIComponent(responseId)}/answers/${encodeURIComponent(cardId)}`,
    mutation("PUT", { choice }),
  ).then(stateResponse);
}

export function submitVisitorAnswers(
  responseId: string,
  managementSecret: string,
) {
  if (!isVisitorResponseId(responseId) || !SECRET.test(managementSecret)) {
    invalidInput();
  }
  return fetch(
    `/api/responses/${encodeURIComponent(responseId)}/submit`,
    mutation("POST", { managementSecret }),
  ).then(stateResponse);
}

export function continueVisitorResponse(responseId: string) {
  if (!isVisitorResponseId(responseId)) invalidInput();
  return fetch(
    `/api/responses/${encodeURIComponent(responseId)}/continue`,
    mutation("POST", {}),
  ).then(stateResponse);
}

export async function recordVisitorEvent(
  responseId: string,
  event: "comparison_viewed" | "same_pack_start_clicked",
) {
  if (
    !isVisitorResponseId(responseId) ||
    (event !== "comparison_viewed" && event !== "same_pack_start_clicked")
  ) {
    invalidInput();
  }
  const response = await fetch(
    `/api/responses/${encodeURIComponent(responseId)}/events`,
    mutation("POST", { event }, true),
  );
  if (
    response.status !== 204 ||
    response.headers.get("cache-control") !== "private, no-store"
  ) {
    throw new VisitorResponseHttpError(
      response.status,
      "INVALID_RESPONSE",
      null,
    );
  }
}
