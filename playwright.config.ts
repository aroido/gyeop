import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

// Test-only deterministic fixture. Never use this key outside local/CI tests.
const testKey = Buffer.alloc(32, 7).toString("base64url");
const proxyKey = Buffer.alloc(32, 8).toString("base64url");
const rateLimitKey = Buffer.alloc(32, 9).toString("base64url");
const liveOwnerFlow = process.env.GYEOP_E2E_LIVE === "1";

function localSupabase(): Record<string, string> {
  if (!liveOwnerFlow) return {};
  const output = execFileSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "env"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const values: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = JSON.parse(match[2]) as string;
  }
  if (!values.API_URL || !values.SECRET_KEY) {
    throw new Error(
      "Live owner flow requires local Supabase API_URL and SECRET_KEY",
    );
  }
  const serverSecretName = ["SUPABASE", "SECRET", "KEY"].join("_");
  return {
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    [serverSecretName]: values.SECRET_KEY,
  };
}

const supabaseEnv = localSupabase();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...(liveOwnerFlow
      ? {
          extraHTTPHeaders: {
            "x-forwarded-for": "198.51.100.218",
            "x-forwarded-host": "127.0.0.1",
            "x-forwarded-proto": "https",
            "x-forwarded-port": "443",
            "x-gyeop-origin-verify": proxyKey,
          },
        }
      : {}),
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      ACCOUNT_DELETE_REAUTH_KEYRING: JSON.stringify({ v1: testKey }),
      ACCOUNT_DELETE_REAUTH_ACTIVE_VERSION: "v1",
      APP_URL: "http://127.0.0.1:3000",
      ORIGIN_PROXY_SECRET: proxyKey,
      RATE_LIMIT_SECRET: rateLimitKey,
      ...supabaseEnv,
    },
  },
});
