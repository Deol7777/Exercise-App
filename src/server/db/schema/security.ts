/**
 * Failed sign-in attempts, so a password can be guessed at only so fast.
 *
 * Rows are per *email*, not per user id: an attempt against an address that has
 * no account has to be counted the same way, or the throttle itself would tell
 * an attacker which addresses are real.
 *
 * Deliberately not in the Auth.js schema file — Auth.js does not know this
 * table exists. It is ours, and the adapter must not be tempted to touch it.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const signInAttempts = pgTable(
  "sign_in_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lower-cased email. Matching is case-insensitive everywhere else too. */
    emailKey: text("email_key").notNull(),
    attemptedAt: timestamp("attempted_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sign_in_attempts_email_time_idx").on(table.emailKey, table.attemptedAt)],
);
