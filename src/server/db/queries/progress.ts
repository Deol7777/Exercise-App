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
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

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

export type WeekTotals = {
  /**
   * Monday 00:00 in the database's timezone, which on Neon is UTC — the same
   * cut `findWeeklyVolume` uses, so "this week" means one thing across the app.
   */
  weekStart: Date;
  workouts: number;
  /** Sum of reps × weight over working sets, kilograms. */
  volume: number;
  setCount: number;
};

export type SessionTotals = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  exerciseCount: number;
  setCount: number;
  /** Kilograms. */
  volume: number;
  /** The heaviest working set of the session, or null if it held only warm-ups. */
  topSet: { weight: number; reps: number } | null;
};

/** `date_trunc('week', …)` is ISO — weeks start on Monday. */
const thisWeek = sql`date_trunc('week', now())`;

/**
 * The home screen's "this week" band. Two statements rather than one because
 * the counts are at different grains: joining sessions to sets to get volume
 * would multiply the session count by the number of sets in each.
 */
export async function findWeekTotals(userId: string): Promise<WeekTotals> {
  const weekStartMs = sql<number>`(extract(epoch from ${thisWeek}) * 1000)::float8`;

  const [sessionSide, setSide] = await Promise.all([
    db
      .select({
        /** A constant expression, so it needs no `group by` beside the count. */
        weekStartMs: weekStartMs.as("week_start_ms"),
        workouts: sql<number>`count(*)::int`,
      })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), gte(workoutSessions.startedAt, thisWeek))),
    db
      .select({
        volume: sql<number>`coalesce(sum(${sets.reps} * ${sets.weight}), 0)::float8`,
        setCount: sql<number>`count(${sets.id})::int`,
      })
      .from(sets)
      .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
      .where(and(workingSetsOf(userId), gte(workoutSessions.startedAt, thisWeek))),
  ]);

  return {
    weekStart: new Date(sessionSide[0].weekStartMs),
    workouts: sessionSide[0].workouts,
    volume: setSide[0].volume,
    setCount: setSide[0].setCount,
  };
}

/** Midnight in the database's timezone (UTC), the same cut `thisWeek` uses. */
const today = sql`date_trunc('day', now())`;

/**
 * One session, totalled. Split out because "today's workout" and "the last one
 * before today" differ only in how the row is chosen, and totalling them two
 * ways is how the same session ends up with two different set counts.
 */
async function totalsFor(session: {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
}): Promise<SessionTotals> {
  const [totals, top] = await Promise.all([
    /**
     * The warm-up filter sits in the join, not the `where`: as a `where` it
     * would drop an exercise that was only warmed up, and that exercise still
     * happened — it just contributed no volume.
     */
    db
      .select({
        exerciseCount: sql<number>`count(distinct ${sessionExercises.id})::int`,
        setCount: sql<number>`count(${sets.id})::int`,
        volume: sql<number>`coalesce(sum(${sets.reps} * ${sets.weight}), 0)::float8`,
      })
      .from(sessionExercises)
      .leftJoin(
        sets,
        and(eq(sets.sessionExerciseId, sessionExercises.id), eq(sets.isWarmup, false)),
      )
      .where(eq(sessionExercises.workoutSessionId, session.id)),
    db
      .select({ weight: sets.weight, reps: sets.reps })
      .from(sets)
      .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
      .where(and(eq(sessionExercises.workoutSessionId, session.id), eq(sets.isWarmup, false)))
      .orderBy(desc(sets.weight), desc(sets.reps))
      .limit(1),
  ]);

  return {
    ...session,
    exerciseCount: totals[0].exerciseCount,
    setCount: totals[0].setCount,
    volume: totals[0].volume,
    topSet: top[0] ? { weight: Number(top[0].weight), reps: top[0].reps } : null,
  };
}

const sessionRow = {
  id: workoutSessions.id,
  startedAt: workoutSessions.startedAt,
  endedAt: workoutSessions.endedAt,
};

/**
 * Today's workout, whether it is still running or already done — the home
 * screen's "Today" card is filled by having trained, not by having finished.
 *
 * The day is cut in the database's timezone, which is UTC. For a user far
 * enough west, a late-evening workout is already "tomorrow" by that cut and
 * drops off the card. Weeks are cut the same way (`findWeekTotals`), so the two
 * at least agree with each other; fixing it properly means knowing the user's
 * timezone, which nothing stores yet.
 */
export async function findTodaySession(userId: string): Promise<SessionTotals | null> {
  const [session] = await db
    .select(sessionRow)
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), gte(workoutSessions.startedAt, today)))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  return session ? totalsFor(session) : null;
}

/**
 * The most recent finished session, totalled.
 *
 * `excludeToday` is what keeps the home screen from showing one workout twice:
 * today's session is already the card at the top, and repeating it under
 * "recent" reads as two separate workouts.
 */
export async function findLatestFinishedSession(
  userId: string,
  options: { excludeToday?: boolean } = {},
): Promise<SessionTotals | null> {
  const [session] = await db
    .select(sessionRow)
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.endedAt),
        options.excludeToday ? lt(workoutSessions.startedAt, today) : undefined,
      ),
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  return session ? totalsFor(session) : null;
}

/**
 * One day of the history calendar that has at least one workout on it.
 *
 * `day` is the day of the month as an integer rather than a `Date` on purpose.
 * A `Date` would be read back with `getDate()` somewhere and silently shift a
 * cell for anyone outside the database's timezone — `extract(day from …)` and
 * src/lib/month.ts agree on UTC and cannot drift.
 */
export type MonthDay = {
  /** 1–31, in the database's timezone (UTC on Neon). */
  day: number;
  sessionCount: number;
  /** The earliest session of that day: where tapping the cell goes. */
  workoutSessionId: string;
  /** Total seconds of *finished* sessions that day; a running one adds none. */
  seconds: number;
};

/**
 * Every day of one month that has a workout on it, with the counts the history
 * screen totals up.
 *
 * Grouped in SQL rather than fetched row by row and bucketed in JS, so the day
 * boundary is Postgres's — the same `date_trunc` cut the rest of this file uses.
 * Seconds rather than minutes because the caller sums across the month and
 * floors once: summing per-day floors loses up to a minute a day.
 *
 * Unfinished sessions count as workouts and contribute no time, which is why
 * `sum` is over a filtered expression instead of the whole group.
 */
export async function findMonthOfSessions(
  userId: string,
  from: Date,
  to: Date,
): Promise<MonthDay[]> {
  return db
    .select({
      day: sql<number>`extract(day from ${workoutSessions.startedAt})::int`.as("day"),
      sessionCount: sql<number>`count(*)::int`,
      workoutSessionId: sql<string>`(array_agg(${workoutSessions.id} order by ${workoutSessions.startedAt}))[1]`,
      seconds: sql<number>`coalesce(sum(extract(epoch from (${workoutSessions.endedAt} - ${workoutSessions.startedAt}))), 0)::float8`,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.startedAt, from),
        lt(workoutSessions.startedAt, to),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}
