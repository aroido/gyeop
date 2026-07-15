import { Buffer } from "node:buffer";

import { defineConfig, devices } from "@playwright/test";

// Test-only deterministic fixture. Never use this key outside local/CI tests.
const testKey = Buffer.alloc(32, 7).toString("base64url");

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
    },
  },
});
