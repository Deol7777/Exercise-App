/**
 * Routines: a named, ordered list of exercises you keep and start a workout
 * from — "Push Day", "Legs A". See docs/glossary.md.
 *
 * A routine is a *plan*, not a record. Starting one copies its exercises into a
 * fresh workout session and the two never speak again: there is no `routine_id`
 * on `workout_sessions`, so editing a routine tomorrow cannot rewrite a workout
 * logged today.
 *
 * Every row here is user-owned, transitively through `routines.user_id`. That
 * id comes from the server-side auth session and nowhere else.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { exercises } from "./exercises";

export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    /** Two routines called "Push Day" in one account is a mistake, not a feature. */
    unique("routines_user_name_unique").on(table.userId, table.name),
    /** Every read is "this user's routines, alphabetically". */
    index("routines_user_name_idx").on(table.userId, table.name),
  ],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    /**
     * cascade, deliberately unlike `session_exercises.exercise_id`, which is
     * restrict. A routine is a plan: deleting a custom exercise should quietly
     * drop it from the plan. Deleting it must never drop the history of having
     * performed it — which is why the other side of the model refuses.
     */
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    /** 1-based order within the routine. */
    position: integer("position").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("routine_exercises_position_unique").on(table.routineId, table.position),
    index("routine_exercises_routine_idx").on(table.routineId),
    index("routine_exercises_exercise_idx").on(table.exerciseId),
    check("routine_exercises_position_positive", sql`${table.position} >= 1`),
  ],
);
