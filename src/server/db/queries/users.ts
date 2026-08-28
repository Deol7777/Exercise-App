/**
 * Data access for `users`. Drizzle lives here and only here — services call
 * these functions, and nothing above the service layer sees a query.
 */
import { eq, sql } from "drizzle-orm";

import type { Theme } from "@/lib/theme";
import type { WeightUnit } from "@/lib/weight";

import { db } from "..";
import { exercises, routines, users, workoutSessions } from "../schema";

/** Email is stored as given but matched case-insensitively; addresses are not case-sensitive in practice. */
const emailMatches = (email: string) => sql`lower(${users.email}) = lower(${email})`;

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(emailMatches(email))
    .limit(1);

  return row ?? null;
}

export async function insertUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}): Promise<{ id: string; email: string; name: string | null }> {
  const [row] = await db
    .insert(users)
    .values(input)
    .returning({ id: users.id, email: users.email, name: users.name });

  return row;
}

/** Everything about a user that is presentation and not identity. */
export type Preferences = { weightUnit: WeightUnit; theme: Theme };

/**
 * One row read, not one per preference: a signed-in page needs the unit and
 * the theme on the same render (src/app/_lib/require-account.ts), and asking
 * twice would put two round trips in front of every screen.
 */
export async function findPreferences(userId: string): Promise<Preferences | null> {
  const [row] = await db
    .select({ weightUnit: users.weightUnit, theme: users.theme })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Writes whatever the patch names and returns the whole set. An empty patch
 * would be an `update ... set` with nothing in it, which Drizzle refuses, so
 * the caller is responsible for not sending one — the Zod schema at the
 * handler edge is where that is enforced.
 */
export async function updatePreferences(
  userId: string,
  patch: Partial<Preferences>,
): Promise<Preferences | null> {
  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({ weightUnit: users.weightUnit, theme: users.theme });

  return row ?? null;
}

/**
 * Removes an account and everything hanging off it, in one transaction.
 *
 * The order is forced by the foreign keys and is the whole reason this is not a
 * single `delete from users`: `exercises.owner_id` cascades from `users`, but
 * `session_exercises.exercise_id` is `restrict`, so deleting a user who ever
 * logged one of their own custom exercises would try to remove a catalog row
 * that history still references, and Postgres refuses. Training data first,
 * then the custom exercises nothing points at any more, then the user.
 *
 * Sets and exercise entries need no statement of their own — they cascade from
 * `workout_sessions`.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return false;

    await tx.delete(workoutSessions).where(eq(workoutSessions.userId, userId));
    /**
     * Before the custom exercises they point at. The cascade from `users` would
     * cover this on its own, but every delete here is spelled out on purpose —
     * an order that only works by accident is one schema change from not.
     */
    await tx.delete(routines).where(eq(routines.userId, userId));
    await tx.delete(exercises).where(eq(exercises.ownerId, userId));
    await tx.delete(users).where(eq(users.id, userId));

    return true;
  });
}

export async function userExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return row !== undefined;
}
