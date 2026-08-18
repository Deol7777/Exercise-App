/**
 * Brings the test database to a known state once per run: schema migrated from
 * the committed migrations, global exercise catalog seeded.
 *
 * It fails loudly if the container is not up. That is deliberate — a suite that
 * silently fell back to another database would be writing to Neon.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { seedGlobalExercises } from "../server/db/seed-data";

export default async function setup() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString?.includes("localhost")) {
    throw new Error(
      `Refusing to run tests against ${connectionString ?? "an unset DATABASE_URL"}. ` +
        "Start the test database with `docker compose up -d`.",
    );
  }

  const pool = new Pool({ connectionString });

  try {
    await waitForPostgres(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "src/server/db/migrations" });
    await seedGlobalExercises(db);
  } finally {
    await pool.end();
  }
}

/** The container reports healthy before it accepts connections on a cold start. */
async function waitForPostgres(pool: Pool, attempts = 30) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
