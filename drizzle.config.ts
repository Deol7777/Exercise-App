import { defineConfig } from "drizzle-kit";

/** drizzle-kit runs outside Next, so nothing has loaded .env.local yet. */
process.loadEnvFile(".env.local");

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("DATABASE_URL_UNPOOLED is not set. Migrations need the direct, non-pooled Neon string.");
}

export default defineConfig({
  schema: "./src/server/db/schema",
  out: "./src/server/db/migrations",
  dialect: "postgresql",
  /** Direct connection, never the pooler: migrations need a real session. */
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED },
  strict: true,
  verbose: true,
});
