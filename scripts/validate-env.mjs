import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";

const KEYRING_NAME = "ACCOUNT_DELETE_REAUTH_KEYRING";
const ACTIVE_VERSION_NAME = "ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION";

export function validateAccountDeleteEnv(env = process.env) {
  const rawKeyring = env[KEYRING_NAME];
  const activeVersion = env[ACTIVE_VERSION_NAME];

  if (!rawKeyring) {
    throw new Error(`${KEYRING_NAME} is required`);
  }
  if (!activeVersion) {
    throw new Error(`${ACTIVE_VERSION_NAME} is required`);
  }

  let keyring;
  try {
    keyring = JSON.parse(rawKeyring);
  } catch {
    throw new Error(`${KEYRING_NAME} must be a JSON object`);
  }

  if (!keyring || Array.isArray(keyring) || typeof keyring !== "object") {
    throw new Error(`${KEYRING_NAME} must be a JSON object`);
  }

  const versions = Object.keys(keyring);
  if (versions.length === 0) {
    throw new Error(`${KEYRING_NAME} must contain at least one key`);
  }

  for (const version of versions) {
    const encodedKey = keyring[version];
    if (
      !version ||
      typeof encodedKey !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(encodedKey) ||
      Buffer.from(encodedKey, "base64url").length < 32 ||
      Buffer.from(encodedKey, "base64url").toString("base64url") !== encodedKey
    ) {
      throw new Error(`${KEYRING_NAME} contains an invalid key`);
    }
  }

  if (!Object.hasOwn(keyring, activeVersion)) {
    throw new Error(`${ACTIVE_VERSION_NAME} does not reference a retained key`);
  }

  return { activeVersion, versions };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validateAccountDeleteEnv();
    console.log("Environment validation passed.");
  } catch (error) {
    console.error(`Environment validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
