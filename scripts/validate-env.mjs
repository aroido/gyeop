import { pathToFileURL } from "node:url";

import { parseAccountDeleteKeyring } from "../lib/security/account-delete-keyring.mjs";
import { validateAppUrl } from "../lib/http/http-boundary-core.mjs";
import { parseRateLimitSecret } from "../lib/security/network-key.mjs";
import { parseProxyOriginSecret } from "../lib/security/proxy-origin-secret.mjs";

export function validateAccountDeleteEnv(env = process.env) {
  const { activeVersion, versions } = parseAccountDeleteKeyring(env);

  return { activeVersion, versions: [...versions] };
}

export function validateHttpBoundaryEnv(env = process.env) {
  const appUrl = validateAppUrl(env.APP_URL, env.NODE_ENV);
  const proxySecret = parseProxyOriginSecret(env.ORIGIN_PROXY_SECRET);
  parseRateLimitSecret(env.RATE_LIMIT_SECRET);
  return Object.freeze({
    appOrigin: appUrl.origin,
    proxyReaderCount: proxySecret.readers.length,
  });
}

export function validateRuntimeEnv(env = process.env) {
  return Object.freeze({
    accountDelete: validateAccountDeleteEnv(env),
    httpBoundary: validateHttpBoundaryEnv(env),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validateRuntimeEnv();
    console.log("Environment validation passed.");
  } catch (error) {
    console.error(`Environment validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
