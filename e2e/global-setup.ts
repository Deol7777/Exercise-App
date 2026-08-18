/**
 * Prepares the same local database the Vitest suite uses, and empties it: these
 * tests sign up real users through the UI, so leftovers from a previous run
 * would collide on the unique email.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

import { seedGlobalExercises } from "../src/server/db/seed-data";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://exercise:exercise@localhost:5433/exercise_test";

export default async function globalSetup() {
  if (!TEST_DATABASE_URL.includes("localhost")) {
    throw new Error("The end-to-end suite only runs against the local test database.");
  }

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });

  try {
    await waitForPostgres(pool);
    const db = drizzle(pool);

    await migrate(db, { migrationsFolder: "src/server/db/migrations" });
    await seedGlobalExercises(db);

    /** Same order account deletion needs: training data, custom exercises, users. */
    await db.execute(sql`delete from workout_sessions`);
    await db.execute(sql`delete from exercises where owner_id is not null`);
    await db.execute(sql`delete from users`);
  } finally {
    await pool.end();
  }
}

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
