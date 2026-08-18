/**
 * The logging model: workout session -> exercise entry -> set (ADR 0004).
 *
 * The `session_exercises` row between session and sets is what gives ordering,
 * per-exercise notes and (later) supersets somewhere to live.
 *
 * Every row here is user-owned, transitively through `workout_sessions.user_id`.
 * That id comes from the server-side auth session and nowhere else.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { exercises } from "./exercises";

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    /** NULL while the session is still in progress. */
    endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Every history read is "this user's sessions, newest first". */
    index("workout_sessions_user_started_idx").on(table.userId, table.startedAt.desc()),
    check("workout_sessions_ended_after_started", sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`),
  ],
);

export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    /**
     * restrict, not cascade: deleting a catalog exercise must not silently
     * delete the history of having performed it.
     */
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    /** 1-based order within the session. */
    position: integer("position").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_exercises_position_unique").on(table.workoutSessionId, table.position),
    index("session_exercises_session_idx").on(table.workoutSessionId),
    index("session_exercises_exercise_idx").on(table.exerciseId),
    check("session_exercises_position_positive", sql`${table.position} >= 1`),
  ],
);

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionExerciseId: uuid("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    /** 1-based order within the exercise entry. */
    position: integer("position").notNull(),
    reps: integer("reps").notNull(),
    /**
     * Kilograms, always (ADR 0004). The pg driver returns numeric as a
     * *string*; it is converted to a number once, in the data-access layer,
     * and never with a scattered Number() call in the UI.
     */
    weight: numeric("weight", { precision: 6, scale: 2 }).notNull(),
    /** Warm-up sets are stored identically and excluded from every statistic. */
    isWarmup: boolean("is_warmup").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sets_position_unique").on(table.sessionExerciseId, table.position),
    index("sets_session_exercise_idx").on(table.sessionExerciseId),
    check("sets_position_positive", sql`${table.position} >= 1`),
    check("sets_reps_positive", sql`${table.reps} >= 1`),
    check("sets_weight_not_negative", sql`${table.weight} >= 0`),
  ],
);
