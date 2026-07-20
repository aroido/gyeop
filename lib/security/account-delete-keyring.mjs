import { Buffer } from "node:buffer";

const KEYRING_NAME = "ACCOUNT_DELETE_REAUTH_KEYRING";
const ACTIVE_VERSION_NAME = "ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function parseAccountDeleteKeyring(env = process.env) {
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

  const versions = Object.keys(keyring).sort();
  if (versions.length === 0) {
    throw new Error(`${KEYRING_NAME} must contain at least one key`);
  }

  const readers = versions.map((keyVersion) => {
    const encodedKey = keyring[keyVersion];
    if (
      !keyVersion ||
      typeof encodedKey !== "string" ||
      !/^[A-Za-z0-9_-]+$/.test(encodedKey)
    ) {
      throw new Error(`${KEYRING_NAME} contains an invalid key`);
    }

    const key = Buffer.from(encodedKey, "base64url");
    if (key.length < 32 || key.toString("base64url") !== encodedKey) {
      throw new Error(`${KEYRING_NAME} contains an invalid key`);
    }

    return Object.freeze({ keyVersion, key });
  });

  if (!Object.hasOwn(keyring, activeVersion)) {
    throw new Error(`${ACTIVE_VERSION_NAME} does not reference a retained key`);
  }

  return Object.freeze({
    activeVersion,
    readers: Object.freeze(readers),
    versions: Object.freeze(versions),
  });
}
