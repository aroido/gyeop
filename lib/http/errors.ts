import { securityHeaders } from "./security-headers.mjs";

const ERROR_DEFINITIONS = Object.freeze({
  INVALID_REQUEST: Object.freeze({
    status: 400,
    message: "요청을 확인해 주세요.",
  }),
  INVALID_ORIGIN: Object.freeze({
    status: 403,
    message: "허용되지 않은 요청입니다.",
  }),
  UNSUPPORTED_MEDIA_TYPE: Object.freeze({
    status: 415,
    message: "JSON 형식으로 보내 주세요.",
  }),
  PAYLOAD_TOO_LARGE: Object.freeze({
    status: 413,
    message: "요청 내용이 너무 큽니다.",
  }),
  INVALID_JSON: Object.freeze({
    status: 400,
    message: "요청 내용을 읽을 수 없습니다.",
  }),
  INVALID_INPUT: Object.freeze({
    status: 400,
    message: "입력 내용을 확인해 주세요.",
  }),
  RATE_LIMITED: Object.freeze({
    status: 429,
    message: "잠시 후 다시 시도해 주세요.",
  }),
  INTERNAL_ERROR: Object.freeze({
    status: 500,
    message: "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  }),
});

export type BoundaryErrorCode = keyof typeof ERROR_DEFINITIONS;

export class BoundaryError extends Error {
  readonly code: BoundaryErrorCode;

  constructor(code: BoundaryErrorCode) {
    super(code);
    this.name = "BoundaryError";
    this.code = code;
  }
}

const retryAfterByResponse = new WeakMap<Response, number>();

export function errorResponse(code: BoundaryErrorCode, retryAfter?: number) {
  const definition = ERROR_DEFINITIONS[code];
  const response = Response.json(
    { code, message: definition.message },
    { status: definition.status },
  );
  if (code === "RATE_LIMITED") {
    if (!Number.isSafeInteger(retryAfter) || retryAfter! < 1) {
      throw new Error("Retry-After must be a positive integer");
    }
    retryAfterByResponse.set(response, retryAfter!);
  }
  return response;
}

const RESERVED_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "x-request-id",
  "retry-after",
];

export function finalizeBoundaryResponse(
  response: Response,
  requestId: string,
  env = process.env,
) {
  const headers = new Headers(response.headers);
  for (const name of RESERVED_HEADERS) headers.delete(name);
  for (const header of securityHeaders(env))
    headers.set(header.key, header.value);
  headers.set("X-Request-ID", requestId);

  const retryAfter = retryAfterByResponse.get(response);
  if (response.status === 429 && retryAfter !== undefined) {
    headers.set("Retry-After", String(retryAfter));
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function boundaryErrorDefinition(code: BoundaryErrorCode) {
  return ERROR_DEFINITIONS[code];
}
