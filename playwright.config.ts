import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against a real Next server against the local
 * test database (ADR 0009). This is the only suite that exercises Auth.js
 * itself — the route-handler tests in `src/app/api/routes.test.ts` mock
 * `currentUserId`, so a break in the JWT callback chain is invisible to them.
 *
 * Port 3100, not 3000, so a development server can stay running while these do.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://exercise:exercise@localhost:5433/exercise_test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  /** One worker: the suite signs in as real users against one shared database. */
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    /**
     * `@next/env` does not overwrite variables that are already set, so these
     * win over `.env.local` — which is what keeps the browser off Neon.
     */
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_UNPOOLED: TEST_DATABASE_URL,
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
      AUTH_URL: `http://localhost:${PORT}`,
      NODE_ENV: "development",
    },
  },
});
