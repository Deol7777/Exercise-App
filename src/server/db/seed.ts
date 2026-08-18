/**
 * Seeds the global exercise catalog against Neon (ADR 0004). The list itself,
 * and the insert, live in seed-data.ts so the test suite seeds from the same
 * source.
 *
 *   npm run db:seed
 */
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { exercises } from "./schema";
import { GLOBAL_EXERCISES, seedGlobalExercises } from "./seed-data";

process.loadEnvFile(".env.local");

async function main() {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("DATABASE_URL_UNPOOLED is not set. Seeding uses the direct, non-pooled Neon string.");
  }

  /** Direct connection: this is an admin task, not request traffic. */
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const db = drizzle(pool);

  try {
    const before = await db.$count(exercises, isNull(exercises.ownerId));
    const inserted = await seedGlobalExercises(db);
    const after = await db.$count(exercises, isNull(exercises.ownerId));

    console.log(
      `Global catalog: ${GLOBAL_EXERCISES.length} defined, ${inserted.length} inserted, ` +
        `${GLOBAL_EXERCISES.length - inserted.length} already present (${before} -> ${after} rows).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
