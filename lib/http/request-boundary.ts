import { randomUUID } from "node:crypto";
import type { ZodRawShape } from "zod";

import {
  deriveNetworkKey,
  parseRateLimitSecret,
} from "../security/network-key.mjs";
import {
  isMutationMethod,
  readBoundedJson,
  validateMutationOrigin,
  validateProxyRequest,
} from "./http-boundary-core.mjs";
import {
  BoundaryError,
  errorResponse,
  finalizeBoundaryResponse,
  type BoundaryErrorCode,
} from "./errors.ts";
import {
  parseStrictJson,
  type StrictJsonOutput,
  type StrictJsonSchema,
} from "./strict-json-schema.ts";

type BoundaryOptions<Shape extends ZodRawShape> = Readonly<{
  schema?: StrictJsonSchema<Shape>;
  maximumBodyBytes?: number;
  privateNoStore?: true;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}>;

type BoundaryContext<Shape extends ZodRawShape> = Readonly<{
  input: StrictJsonOutput<StrictJsonSchema<Shape>> | undefined;
  networkKey: Uint8Array;
  signal: AbortSignal;
}>;

function asBoundaryCode(error: unknown): BoundaryErrorCode {
  if (error instanceof BoundaryError) return error.code;
  if (!(error instanceof Error)) return "INTERNAL_ERROR";
  const allowed = new Set<BoundaryErrorCode>([
    "INVALID_REQUEST",
    "INVALID_ORIGIN",
    "UNSUPPORTED_MEDIA_TYPE",
    "PAYLOAD_TOO_LARGE",
    "INVALID_JSON",
    "INVALID_INPUT",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
  ]);
  return allowed.has(error.message as BoundaryErrorCode)
    ? (error.message as BoundaryErrorCode)
    : "INTERNAL_ERROR";
}

function finalizePublicResponse(
  response: Response,
  requestId: string,
  env: NodeJS.ProcessEnv,
  privateNoStore: boolean,
) {
  const finalized = finalizeBoundaryResponse(response, requestId, env);
  if (privateNoStore) {
    finalized.headers.set("Cache-Control", "private, no-store");
  }
  return finalized;
}

export async function withPublicRequest<Shape extends ZodRawShape>(
  request: Request,
  options: BoundaryOptions<Shape>,
  callback: (context: BoundaryContext<Shape>) => Response | Promise<Response>,
) {
  const requestId = randomUUID();
  const env = options.env ?? process.env;
  try {
    const proxy = validateProxyRequest(request.headers, env);
    validateMutationOrigin(request, proxy.appUrl);

    let input: StrictJsonOutput<StrictJsonSchema<Shape>> | undefined;
    if (isMutationMethod(request.method)) {
      if (!options.schema || options.maximumBodyBytes === undefined) {
        throw new BoundaryError("INTERNAL_ERROR");
      }
      const json = await readBoundedJson(request, options.maximumBodyBytes);
      let parsed;
      try {
        parsed = parseStrictJson(options.schema, json);
      } catch {
        throw new BoundaryError("INTERNAL_ERROR");
      }
      if (!parsed.success) throw new BoundaryError("INVALID_INPUT");
      input = parsed.data as StrictJsonOutput<StrictJsonSchema<Shape>>;
    } else if (options.schema || options.maximumBodyBytes !== undefined) {
      throw new BoundaryError("INTERNAL_ERROR");
    }

    const networkKey = deriveNetworkKey({
      ip: proxy.forwardedFor,
      secret: parseRateLimitSecret(env.RATE_LIMIT_SECRET),
      now: options.now,
    });
    const response = await callback(
      Object.freeze({
        input,
        networkKey,
        signal: request.signal,
      }),
    );
    if (!(response instanceof Response)) {
      throw new BoundaryError("INTERNAL_ERROR");
    }
    return finalizePublicResponse(
      response,
      requestId,
      env,
      options.privateNoStore === true,
    );
  } catch (error) {
    return finalizePublicResponse(
      errorResponse(asBoundaryCode(error)),
      requestId,
      env,
      options.privateNoStore === true,
    );
  }
}
