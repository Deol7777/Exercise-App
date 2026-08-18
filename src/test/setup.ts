/**
 * Per-file setup: every test starts from an empty log and the seeded catalog.
 *
 * The deletion order matters and is the same order account deletion would need
 * (see architecture.md, "Deleting a user fails if they logged a custom
 * exercise"): training data first, then custom exercises, then users.
 * `truncate ... cascade` is not usable here — it would empty `exercises`
 * entirely, seeded rows included.
 */
import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";

import { db } from "../server/db";

beforeEach(async () => {
  await db.execute(sql`delete from workout_sessions`);
  await db.execute(sql`delete from exercises where owner_id is not null`);
  await db.execute(sql`delete from users`);
});
