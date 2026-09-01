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
import { and, desc, eq, exists, gte, isNotNull, lt, type SQL, sql } from "drizzle-orm";

import type { MuscleGroup } from "@/lib/muscle-groups";
import type { Granularity } from "@/lib/range";
import { APP_TIME_ZONE } from "@/lib/time-zone";

import { db } from "@/server/db/client";
import { exercises } from "@/server/db/schema/exercises";
import { sessionExercises, sets, workoutSessions } from "@/server/db/schema/training";

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

export type VolumePoint = {
  /** The instant the bucket begins, cut in the app's timezone. */
  bucket: Date;
  muscleGroup: MuscleGroup;
  /** Sum of reps × weight over working sets, kilograms. */
  volume: number;
  setCount: number;
};

/**
 * Days and weeks are cut at midnight in the app's timezone, not the database's.
 *
 * `AT TIME ZONE` applied to a `timestamptz` yields the wall-clock `timestamp`
 * in that zone; applied to a `timestamp` it reads it *as* that zone and gives a
 * `timestamptz` back. Both directions are needed: truncate in local wall clock,
 * then convert the boundary back to an instant so it can be compared against
 * `started_at`. Dropping the second conversion compares an instant to a naive
 * timestamp and silently shifts every boundary by the offset.
 */
const zone = sql.raw(`'${APP_TIME_ZONE}'`);

/**
 * `granularity` is interpolated raw because `date_trunc`'s first argument is a
 * unit name, not a value — a bound parameter there is a syntax error. It is
 * safe only because `Granularity` is a closed union of three literals that
 * never touches user input; widening that type is how this becomes an
 * injection.
 */
const localBucket = (
  at: SQL | typeof workoutSessions.startedAt,
  granularity: Granularity = "day",
) =>
  sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${at} at time zone ${zone}) at time zone ${zone}`;

const localDay = (at: SQL | typeof workoutSessions.startedAt) => localBucket(at, "day");
const localWeek = (at: SQL | typeof workoutSessions.startedAt) => localBucket(at, "week");

/** The join every read here starts from: sets, up to the owning user. */
const workingSetsOf = (userId: string) =>
  and(eq(workoutSessions.userId, userId), eq(sets.isWarmup, false));

/**
 * What makes one working set the record: heaviest first, then most reps at that
 * weight, then most recent. The same ordering decides the best set of a day on
 * the strength chart, where it is applied in TypeScript over the rows
 * `findPerformedSets` returns.
 */
const heaviestFirst = [desc(sets.weight), desc(sets.reps), desc(workoutSessions.startedAt)];

/** The columns a record is built from. */
const recordRow = {
  exerciseId: exercises.id,
  exerciseName: exercises.name,
  muscleGroup: exercises.muscleGroup,
  weight: sets.weight,
  reps: sets.reps,
  achievedAt: workoutSessions.startedAt,
};

/**
 * The heaviest working set per exercise. `distinct on` picks one row per
 * exercise in the order given, which is the record definition in one statement.
 */
export async function findPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  const rows = await db
    .selectDistinctOn([exercises.id], recordRow)
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(workingSetsOf(userId))
    .orderBy(exercises.id, ...heaviestFirst);

  return rows
    .map((row) => ({ ...row, weight: Number(row.weight) }))
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

export type LoggedExercise = {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  /** The most recent workout that held a working set of it. */
  lastPerformedAt: Date;
  /** Workouts it appeared in, inside the window — not sets. */
  sessionCount: number;
};

/**
 * Every exercise this user has actually put a working set into since `since`,
 * most recently trained first.
 *
 * This is what the strength picker offers, and it is deliberately not the
 * catalog: 71 seeded movements plus the user's own, of which a person trains a
 * dozen, is a list to search rather than a row to tap. An exercise that only
 * ever got a warm-up is absent for the same reason it contributes no volume —
 * there is nothing to plot.
 */
export async function findLoggedExercises(userId: string, since: Date): Promise<LoggedExercise[]> {
  /**
   * Epoch milliseconds for the same reason `findWeeklyVolume` uses them: an
   * aggregate over a timestamp comes back through the driver as a string, and
   * `max(started_at)` is not the column any more, so its `mode: "date"` mapping
   * no longer applies.
   */
  const lastMs = sql<number>`(extract(epoch from max(${workoutSessions.startedAt})) * 1000)::float8`;

  const rows = await db
    .select({
      exerciseId: exercises.id,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      lastMs: lastMs.as("last_ms"),
      sessionCount: sql<number>`count(distinct ${workoutSessions.id})::int`,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(and(workingSetsOf(userId), gte(workoutSessions.startedAt, since)))
    .groupBy(exercises.id, exercises.name, exercises.muscleGroup)
    .orderBy(desc(lastMs), exercises.name);

  return rows.map(({ lastMs: ms, ...rest }) => ({ ...rest, lastPerformedAt: new Date(ms) }));
}

export type PerformedSet = {
  workoutSessionId: string;
  /** The workout's start, not the set's — a session is one point on the chart. */
  startedAt: Date;
  reps: number;
  /** Kilograms. */
  weight: number;
};

/**
 * Every working set of one exercise since `since`, oldest first.
 *
 * Rows rather than an aggregate, because the callers want them cut two ways —
 * the heaviest set of each day, and the volume of each bucket — and doing both
 * in SQL would be two statements over the same rows. The scan is
 * one exercise inside a bounded window — a few hundred rows for a year of hard
 * training — so the work saved by pushing it down is not worth the drift.
 */
export async function findPerformedSets(
  userId: string,
  exerciseId: string,
  since: Date,
): Promise<PerformedSet[]> {
  const rows = await db
    .select({
      workoutSessionId: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      reps: sets.reps,
      weight: sets.weight,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(
      and(
        workingSetsOf(userId),
        eq(sessionExercises.exerciseId, exerciseId),
        gte(workoutSessions.startedAt, since),
      ),
    )
    .orderBy(workoutSessions.startedAt, sessionExercises.position, sets.position);

  return rows.map((row) => ({ ...row, weight: Number(row.weight) }));
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

export type LastWorkingSets = {
  workoutSessionId: string;
  /** The workout's start. */
  startedAt: Date;
  /** Working sets of that exercise in that workout, in the order they were done. */
  sets: { reps: number; weight: number }[];
};

/**
 * The working sets of one exercise in the most recent workout that held any —
 * warm-ups excluded, unlike `findLastPerformance`.
 *
 * The two look alike and answer different questions. That one is a *recall* of
 * what happened, warm-ups and all, and it is what the logging screen shows
 * under "last time". This one feeds a statistic, so it obeys the rule every
 * other statistic here obeys: a warm-up is not a set that counts.
 *
 * Deliberately unbounded by a range. "Last time" is whenever it was, and a card
 * that went blank because the last squat was 40 days ago and the range says 30
 * would be answering a question nobody asked.
 *
 * Two statements rather than a window function: which workout was last is one
 * question and what was in it is another, and the same exercise may appear in a
 * workout twice — a second entry of it belongs to the same answer, which is why
 * the second statement filters by session and exercise rather than by entry.
 */
export async function findLastWorkingSets(
  userId: string,
  exerciseId: string,
): Promise<LastWorkingSets | null> {
  const ofExercise = and(workingSetsOf(userId), eq(sessionExercises.exerciseId, exerciseId));

  const [latest] = await db
    .select({ id: workoutSessions.id, startedAt: workoutSessions.startedAt })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(ofExercise)
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  if (!latest) return null;

  const rows = await db
    .select({ reps: sets.reps, weight: sets.weight })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(and(ofExercise, eq(workoutSessions.id, latest.id)))
    .orderBy(sessionExercises.position, sets.position);

  return {
    workoutSessionId: latest.id,
    startedAt: latest.startedAt,
    sets: rows.map((row) => ({ reps: row.reps, weight: Number(row.weight) })),
  };
}

/**
 * Volume per muscle group per bucket, since `from`, oldest bucket first.
 *
 * An exercise belongs to exactly one muscle group, which is what makes this a
 * plain `group by` rather than an apportionment.
 *
 * The bucket size is the caller's, because a week of daily bars and a year of
 * monthly ones are the same question asked at two resolutions (src/lib/range.ts).
 * The lower bound arrives as an instant rather than being computed here, so one
 * place decides where a range begins and the zero-filling in the service can
 * agree with it.
 */
export async function findVolumeByBucket(
  userId: string,
  from: Date,
  granularity: Granularity,
): Promise<VolumePoint[]> {
  /**
   * Epoch milliseconds, not the timestamp itself: `date_trunc` returns a value
   * the driver hands back as a *string* (`2026-08-17 00:00:00+00`), which is
   * not an ISO literal every engine parses. A number crosses the boundary
   * unambiguously and becomes a `Date` below — the same "convert once, here"
   * rule that `numeric` follows.
   */
  const bucketMs = sql<number>`(extract(epoch from ${localBucket(workoutSessions.startedAt, granularity)}) * 1000)::float8`;

  const rows = await db
    .select({
      bucketMs: bucketMs.as("bucket_ms"),
      muscleGroup: exercises.muscleGroup,
      volume: sql<number>`sum(${sets.reps} * ${sets.weight})::float8`,
      setCount: sql<number>`count(${sets.id})::int`,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(and(workingSetsOf(userId), gte(workoutSessions.startedAt, from)))
    .groupBy(bucketMs, exercises.muscleGroup)
    .orderBy(bucketMs, exercises.muscleGroup);

  return rows.map(({ bucketMs: ms, ...rest }) => ({ ...rest, bucket: new Date(ms) }));
}

export type WeekTotals = {
  /**
   * The instant of Monday 00:00 in the app's timezone — the same cut
   * `findWeeklyVolume` uses, so "this week" means one thing across the app.
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
const thisWeek = localWeek(sql`now()`);

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

/** Midnight in the app's timezone, the same cut `thisWeek` uses. */
const today = localDay(sql`now()`);

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
 * cell for anyone outside the server's zone — `extract(day from … at time zone)`
 * and src/lib/month.ts agree on Pacific and cannot drift.
 */
export type MonthDay = {
  /** 1–31, in the app's timezone (src/lib/time-zone.ts). */
  day: number;
  sessionCount: number;
  /**
   * Where tapping the cell goes: the earliest session of that day that has at
   * least one exercise entry, and only if every session of the day is empty,
   * the earliest of those.
   */
  workoutSessionId: string;
  /** Total seconds of *finished* sessions that day; a running one adds none. */
  seconds: number;
};

/**
 * Whether a session has anything logged under it.
 *
 * Written with drizzle's `exists` rather than a `sql` template on purpose: a
 * template renders bare column names, so `where workout_session_id = id` would
 * bind *both* sides inside the sub-select and compare `session_exercises` to
 * itself — false for every row, silently, with the sort falling back to the
 * timestamp and the bug still there. `exists` qualifies both sides.
 */
const hasEntries = exists(
  db
    .select({ one: sql`1` })
    .from(sessionExercises)
    .where(eq(sessionExercises.workoutSessionId, workoutSessions.id)),
);

/**
 * Every day of one month that has a workout on it, with the counts the history
 * screen totals up.
 *
 * Grouped in SQL rather than fetched row by row and bucketed in JS, so one place
 * decides the boundary — the same zone the rest of this file cuts on. The `from`
 * and `to` bounds arrive as instants from `monthStart`/`monthEnd`, which cut
 * there too.
 * Seconds rather than minutes because the caller sums across the month and
 * floors once: summing per-day floors loses up to a minute a day.
 *
 * Unfinished sessions count as workouts and contribute no time, which is why
 * `sum` is over a filtered expression instead of the whole group.
 *
 * The cell links to the earliest session of the day *that has something in it*,
 * not simply the earliest. A start that was tapped and abandoned is a real row
 * with a real timestamp, so ordering on `started_at` alone handed the cell to
 * the empty one and the day read back as "started and left alone" — which is
 * the opposite of what filling the cell claimed. `has_entries` is a sort key
 * rather than a filter on purpose: a day whose sessions are *all* empty still
 * has somewhere to go, and `sessionCount` still counts what was started.
 */
export async function findMonthOfSessions(
  userId: string,
  from: Date,
  to: Date,
): Promise<MonthDay[]> {
  return db
    .select({
      day: sql<number>`extract(day from ${workoutSessions.startedAt} at time zone ${zone})::int`.as(
        "day",
      ),
      sessionCount: sql<number>`count(*)::int`,
      workoutSessionId: sql<string>`(array_agg(${workoutSessions.id} order by ${hasEntries} desc, ${workoutSessions.startedAt} asc))[1]`,
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
