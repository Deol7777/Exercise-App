/**
 * Data access for the sign-in throttle.
 *
 * Everything here keys on a lower-cased email and nothing here joins to
 * `users` — an attempt against an address with no account must be recorded and
 * counted exactly like one against a real account.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "..";
import { signInAttempts } from "../schema";

const key = (email: string) => email.trim().toLowerCase();

export async function countRecentFailures(email: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signInAttempts)
    .where(and(eq(signInAttempts.emailKey, key(email)), gte(signInAttempts.attemptedAt, since)));

  return row?.count ?? 0;
}

export async function recordFailure(email: string): Promise<void> {
  await db.insert(signInAttempts).values({ emailKey: key(email) });
}

/** Called on a successful sign-in: the streak is over. */
export async function clearFailures(email: string): Promise<void> {
  await db.delete(signInAttempts).where(eq(signInAttempts.emailKey, key(email)));
}

/**
 * Housekeeping. There is no scheduler in this app, so expired rows are swept on
 * the next attempt for the same address rather than by a cron job.
 */
export async function deleteFailuresBefore(cutoff: Date): Promise<void> {
  await db.delete(signInAttempts).where(lt(signInAttempts.attemptedAt, cutoff));
}
