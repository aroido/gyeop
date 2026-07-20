import { isIP } from "node:net";

import {
  parseProxyOriginSecret,
  matchesProxyOriginSecret,
} from "../security/proxy-origin-secret.mjs";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CANONICAL_FORWARDED = new Set([
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export function validateAppUrl(value, nodeEnv = process.env.NODE_ENV) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("APP_URL is required");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APP_URL must be a valid origin URL");
  }
  if (
    !/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]+$/.test(value) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname.endsWith(".")
  ) {
    throw new Error("APP_URL must contain an origin only");
  }

  if (nodeEnv === "production") {
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) {
      throw new Error("Production APP_URL must use HTTPS port 443");
    }
  } else {
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (url.protocol !== "http:" || !loopback.has(url.hostname) || !url.port) {
      throw new Error(
        "Local APP_URL must use loopback HTTP with an explicit port",
      );
    }
  }
  return url;
}

function exactHeader(headers, name) {
  const value = headers.get(name);
  if (
    value === null ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes(",") ||
    value.includes("\r") ||
    value.includes("\n") ||
    /\s/.test(value)
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return value;
}

export function validateProxyRequest(headers, env = process.env) {
  for (const [name] of headers) {
    const normalized = name.toLowerCase();
    if (normalized === "forwarded" || normalized === "x-real-ip") {
      throw new Error("INVALID_REQUEST");
    }
    if (
      normalized.startsWith("x-forwarded-") &&
      !CANONICAL_FORWARDED.has(normalized)
    ) {
      throw new Error("INVALID_REQUEST");
    }
  }

  const appUrl = validateAppUrl(env.APP_URL, env.NODE_ENV);
  if (
    env.NODE_ENV === "development" &&
    env.GYEOP_LOCAL_DEV_DIRECT === "1" &&
    !headers.has("x-gyeop-origin-verify") &&
    (headers.get("x-forwarded-for") === null ||
      headers.get("x-forwarded-for") === "127.0.0.1" ||
      headers.get("x-forwarded-for") === "::1") &&
    (headers.get("x-forwarded-host") === null ||
      headers.get("x-forwarded-host") === appUrl.host) &&
    (headers.get("x-forwarded-proto") === null ||
      headers.get("x-forwarded-proto") === appUrl.protocol.slice(0, -1)) &&
    (headers.get("x-forwarded-port") === null ||
      headers.get("x-forwarded-port") === appUrl.port)
  ) {
    return Object.freeze({ forwardedFor: "127.0.0.1", appUrl });
  }
  const proxySecrets = parseProxyOriginSecret(env.ORIGIN_PROXY_SECRET);
  const forwardedFor = exactHeader(headers, "x-forwarded-for");
  if (
    isIP(forwardedFor) === 0 ||
    exactHeader(headers, "x-forwarded-host") !== appUrl.hostname ||
    exactHeader(headers, "x-forwarded-proto") !== "https" ||
    exactHeader(headers, "x-forwarded-port") !== "443" ||
    !matchesProxyOriginSecret(
      exactHeader(headers, "x-gyeop-origin-verify"),
      proxySecrets.readers,
    )
  ) {
    throw new Error("INVALID_REQUEST");
  }
  return Object.freeze({ forwardedFor, appUrl });
}

export function validateMutationOrigin(request, appUrl) {
  if (!MUTATION_METHODS.has(request.method.toUpperCase())) return;
  let origin;
  try {
    origin = exactHeader(request.headers, "origin");
  } catch {
    throw new Error("INVALID_ORIGIN");
  }
  if (origin !== appUrl.origin) {
    throw new Error("INVALID_ORIGIN");
  }
}

export function isMutationMethod(method) {
  return MUTATION_METHODS.has(method.toUpperCase());
}

export function validateJsonContentType(headers) {
  const contentType = headers.get("content-type");
  if (
    contentType === null ||
    contentType.includes(",") ||
    !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(contentType)
  ) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }
}

export function declaredContentLength(headers, maximum) {
  const raw = headers.get("content-length");
  if (raw === null) return undefined;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw) || raw.includes(",")) {
    throw new Error("INVALID_REQUEST");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error("INVALID_REQUEST");
  if (value > maximum) throw new Error("PAYLOAD_TOO_LARGE");
  return value;
}

export async function readBoundedJson(request, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 65_536) {
    throw new Error("INTERNAL_ERROR");
  }
  validateJsonContentType(request.headers);
  const declared = declaredContentLength(request.headers, maximum);
  const reader = request.body?.getReader();
  const chunks = [];
  let total = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximum) {
          await reader.cancel();
          throw new Error("PAYLOAD_TOO_LARGE");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
        throw error;
      }
      throw new Error("INVALID_JSON");
    }
  }
  if (declared !== undefined && declared !== total) {
    throw new Error("INVALID_REQUEST");
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("INVALID_JSON");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
}
