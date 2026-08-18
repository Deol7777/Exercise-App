/**
 * The read side: what the training data says over time.
 *
 * Same two rules as queries/training.ts — every statement is scoped by the
 * acting user through `workout_sessions.user_id`, and `numeric` stops being a
 * string here. Aggregates are cast in SQL (`::float8`, `::int`) rather than
 * parsed in JS, because `sum(numeric)` comes back as a string too.
 *
 * Warm-up sets are excluded from every statistic — that is what
 * `is_warmup = false` means (docs/glossary.md, "working set").
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";

import type { MuscleGroup } from "@/lib/muscle-groups";

import { db } from "..";
import { exercises, sessionExercises, sets, workoutSessions } from "../schema";

export type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  /** The heaviest working set: kilograms, and the reps it was done for. */
  weight: number;
  reps: number;
  achievedAt: Date;
};

export type LastPerformance = {
  workoutSessionId: string;
  startedAt: Date;
  entryNotes: string | null;
  sets: { position: number; reps: number; weight: number }[];
};

export type WeeklyVolumePoint = {
  /** Monday of the week, midnight UTC. */
  week: Date;
  muscleGroup: MuscleGroup;
  /** Sum of reps × weight over working sets, kilograms. */
  volume: number;
  setCount: number;
};

/** The join every read here starts from: sets, up to the owning user. */
const workingSetsOf = (userId: string) =>
  and(eq(workoutSessions.userId, userId), eq(sets.isWarmup, false));

/**
 * The heaviest working set per exercise. `distinct on` picks one row per
 * exercise in the order given — heaviest first, then most reps at that weight,
 * then most recent — which is the record definition in one statement.
 */
export async function findPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .selectDistinctOn([exercises.id], {
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      weight: sets.weight,
      reps: sets.reps,
      achievedAt: workoutSessions.startedAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(workingSetsOf(userId))
    .orderBy(exercises.id, desc(sets.weight), desc(sets.reps), desc(workoutSessions.startedAt));

  return rows
    .map((row) => ({ ...row, weight: Number(row.weight) }))
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * The last time this exercise was done, before `excludeWorkoutSessionId` if one
 * is given — the logging screen passes the session in progress, so "last time"
 * means last time, not what was logged five minutes ago.
 *
 * Warm-up sets are included here: this is a recall of what happened, not a
 * statistic.
 */
export async function findLastPerformance(
  userId: string,
  exerciseId: string,
  options: { excludeWorkoutSessionId?: string } = {},
): Promise<LastPerformance | null> {
  const [entry] = await db
    .select({
      entryId: sessionExercises.id,
      workoutSessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      entryNotes: sessionExercises.notes,
    })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(sessionExercises.exerciseId, exerciseId),
        options.excludeWorkoutSessionId
          ? sql`${workoutSessions.id} <> ${options.excludeWorkoutSessionId}`
          : undefined,
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  if (!entry) return null;

  const rows = await db
    .select({ position: sets.position, reps: sets.reps, weight: sets.weight })
    .from(sets)
    .where(eq(sets.sessionExerciseId, entry.entryId))
    .orderBy(sets.position);

  return {
    workoutSessionId: entry.workoutSessionId,
    startedAt: entry.startedAt,
    entryNotes: entry.entryNotes,
    sets: rows.map((row) => ({ ...row, weight: Number(row.weight) })),
  };
}

/**
 * Volume per muscle group per week, most recent week first. An exercise belongs
 * to exactly one muscle group, which is what makes this a plain `group by`
 * rather than an apportionment.
 */
export async function findWeeklyVolume(
  userId: string,
  weeks: number,
): Promise<WeeklyVolumePoint[]> {
  /**
   * Epoch milliseconds, not the timestamp itself: `date_trunc` returns a value
   * the driver hands back as a *string* (`2026-08-17 00:00:00+00`), which is
   * not an ISO literal every engine parses. A number crosses the boundary
   * unambiguously and becomes a `Date` below — the same "convert once, here"
   * rule that `numeric` follows.
   *
   * Weeks are cut in the database's timezone, which on Neon is UTC.
   */
  const weekMs = sql<number>`(extract(epoch from date_trunc('week', ${workoutSessions.startedAt})) * 1000)::float8`;

  const rows = await db
    .select({
      weekMs: weekMs.as("week_ms"),
      muscleGroup: exercises.muscleGroup,
      volume: sql<number>`sum(${sets.reps} * ${sets.weight})::float8`,
      setCount: sql<number>`count(${sets.id})::int`,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(
      and(
        workingSetsOf(userId),
        gte(
          workoutSessions.startedAt,
          sql`date_trunc('week', now()) - make_interval(weeks => ${weeks - 1})`,
        ),
      ),
    )
    .groupBy(weekMs, exercises.muscleGroup)
    .orderBy(desc(weekMs), exercises.muscleGroup);

  return rows.map(({ weekMs: ms, ...rest }) => ({ ...rest, week: new Date(ms) }));
}
