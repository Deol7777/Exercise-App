import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Tests run against the local Postgres in docker-compose.yml, never Neon
 * (ADR 0009). `TEST_DATABASE_URL` overrides the default for anyone running the
 * container elsewhere.
 *
 * One fork, no parallelism: every test writes to the same database and cleans
 * it between cases, so concurrent files would delete each other's rows.
 */
/**
 * Set on the config module, not in `test.env`: `globalSetup` runs in the main
 * process before worker env is applied, and it is what migrates the database.
 * Workers inherit this through the fork.
 */
process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ?? "postgresql://exercise:exercise@localhost:5433/exercise_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    pool: "forks",
    /** Vitest 4: `fileParallelism: false` is the replacement for the old singleFork. */
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
