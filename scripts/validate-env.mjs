import { pathToFileURL } from "node:url";

import { parseAccountDeleteKeyring } from "../lib/security/account-delete-keyring.mjs";

export function validateAccountDeleteEnv(env = process.env) {
  const { activeVersion, versions } = parseAccountDeleteKeyring(env);

  return { activeVersion, versions: [...versions] };
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
