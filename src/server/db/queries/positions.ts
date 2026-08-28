/**
 * The one implementation of `position` assignment, shared by every ordered
 * child table: exercise entries within a workout session, sets within an entry,
 * exercises within a routine.
 *
 * It lives on its own because it is an invariant rather than a convenience —
 * `position` is assigned by the database as `max(position) + 1` inside the
 * insert itself, and is never taken from a request. A second hand-copied
 * version of this expression is how that quietly stops being true.
 */
import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/**
 * The next 1-based position within `scope`, as a subquery on the column's own
 * table. Evaluated in the same statement as the insert, so there is no
 * read-then-write gap for a concurrent insert to slip into — the table's
 * `(parent_id, position)` unique constraint is what catches the loser.
 */
export const nextPosition = (column: PgColumn, scope: SQL) =>
  sql<number>`(select coalesce(max(${column}), 0) + 1 from ${column.table} where ${scope})`;
