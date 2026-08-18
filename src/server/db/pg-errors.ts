/**
 * Recognising Postgres errors by SQLSTATE.
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError`, whose own `code` is
 * undefined — the pg error is on `cause`. Anything that inspects `.code` on the
 * caught error alone silently turns a constraint violation into a 500, so the
 * chain is walked here, once, for every caller.
 */

/** `unique_violation` — a duplicate key on a unique index or constraint. */
export const UNIQUE_VIOLATION = "23505";

export function isPgError(error: unknown, sqlState: string): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if (typeof current !== "object") return false;
    if ("code" in current && (current as { code?: unknown }).code === sqlState) return true;
  }

  return false;
}

export const isUniqueViolation = (error: unknown) => isPgError(error, UNIQUE_VIOLATION);
