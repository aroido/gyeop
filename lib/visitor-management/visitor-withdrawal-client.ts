const SECRET = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export class VisitorWithdrawalHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, retryAfterSeconds: number | null) {
    super("Visitor withdrawal request failed");
    this.name = "VisitorWithdrawalHttpError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function invalidResponse(status: number): never {
  throw new VisitorWithdrawalHttpError(status, "INVALID_RESPONSE", null);
}

function parseRetryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (value === null || !/^[1-9][0-9]*$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

async function decodeError(response: Response): Promise<never> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return invalidResponse(response.status);
  }
  const record = body as { code?: unknown; message?: unknown };
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join("\0") !== "code\0message" ||
    typeof record.code !== "string" ||
    typeof record.message !== "string"
  ) {
    return invalidResponse(response.status);
  }
  const retry = response.status === 429 ? parseRetryAfter(response) : null;
  if (response.status === 429 && retry === null) {
    return invalidResponse(response.status);
  }
  throw new VisitorWithdrawalHttpError(response.status, record.code, retry);
}

export async function withdrawVisitorResponse(token: string) {
  if (!SECRET.test(token)) {
    throw new VisitorWithdrawalHttpError(400, "INVALID_INPUT", null);
  }
  const response = await fetch("/api/responses/withdraw", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (response.headers.get("cache-control") !== "private, no-store") {
    return invalidResponse(response.status);
  }
  if (!response.ok) return decodeError(response);
  if (response.status !== 204 || (await response.text()) !== "") {
    return invalidResponse(response.status);
  }
}
