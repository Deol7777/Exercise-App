/**
 * Reading the log back: what was lifted last time, what the records are, and
 * how much work each muscle group has taken lately.
 *
 * Every function takes the acting user id first, the same as
 * services/training.ts, and knows nothing about HTTP.
 */
import {
  type Month,
  monthEnd,
  monthStart,
} from "@/lib/month";
import type { MuscleGroup } from "@/lib/muscle-groups";
import {
  bucketStart,
  DEFAULT_RANGE,
  type Range,
  RANGE_SHAPE,
  rangeBuckets,
  rangeStart,
} from "@/lib/range";
import { shiftZonedWeeks, startOfZonedDay, startOfZonedWeek } from "@/lib/time-zone";

import {
  findLastPerformance,
  findLastWorkingSets,
  findLatestFinishedSession,
  findLoggedExercises,
  findMonthOfSessions,
  findPerformedSets,
  findPersonalRecords,
  findTodaySession,
  findVolumeByBucket,
  findWeekTotals,
  type LastPerformance,
  type LoggedExercise,
  type MonthDay,
  type PerformedSet,
  type PersonalRecord,
  type SessionTotals,
  type VolumePoint,
  type WeekTotals,
} from "../db/queries/progress";
import { getExercise } from "./exercises";

export type {
  LastPerformance,
  LoggedExercise,
  MonthDay,
  PerformedSet,
  PersonalRecord,
  SessionTotals,
  VolumePoint,
  WeekTotals,
};

/** Bounded so a hand-written `?weeks=` cannot ask for an unbounded scan. */
const MIN_WEEKS = 1;
const MAX_WEEKS = 52;
export const DEFAULT_WEEKS = 8;

/**
 * How far back the exercise dropdowns look, whatever the charts are showing.
 *
 * Deliberately not the selected range: narrowing the charts to one week must
 * not empty the list of lifts you can narrow them to, which is what tying the
 * two together would do the moment somebody took a week off.
 */
const PICKER_WEEKS = MAX_WEEKS;

export function getPersonalRecords(userId: string): Promise<PersonalRecord[]> {
  return findPersonalRecords(userId);
}

/**
 * The last time this user did this exercise. Goes through `getExercise` first,
 * which throws `NotFoundError` for an exercise they cannot see — otherwise an
 * unknown id would come back as "never performed", which is a different claim.
 */
export async function getLastPerformance(
  userId: string,
  exerciseId: string,
  options: { excludeWorkoutSessionId?: string } = {},
): Promise<LastPerformance | null> {
  await getExercise(userId, exerciseId);
  return findLastPerformance(userId, exerciseId, options);
}

/**
 * Volume by muscle group by week, for `GET /api/progress/volume`.
 *
 * The screens do not use this — they ask for a range (`getVolumeSummary`). It
 * stays because the endpoint is published, and it keeps its own week-based
 * window so that contract does not move.
 */
export function getWeeklyVolume(
  userId: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<VolumePoint[]> {
  const bounded = Math.min(Math.max(Math.trunc(weeks) || DEFAULT_WEEKS, MIN_WEEKS), MAX_WEEKS);
  const from = shiftZonedWeeks(startOfZonedWeek(new Date()), -(bounded - 1));
  return findVolumeByBucket(userId, from, "week");
}

/**
 * What the exercise dropdowns offer: the lifts this user has actually trained,
 * most recently trained first.
 */
export function getLoggedExercises(
  userId: string,
  now: Date = new Date(),
): Promise<LoggedExercise[]> {
  return findLoggedExercises(userId, shiftZonedWeeks(startOfZonedWeek(now), -(PICKER_WEEKS - 1)));
}

export type StrengthPoint = {
  /** Midnight of the day it was lifted, in the app's timezone. */
  day: Date;
  /** The heaviest working set of that day, kilograms. Measured, not estimated. */
  weight: number;
  /** The reps it was done for — context for the weight, not part of the ranking. */
  reps: number;
  /** Working sets of this exercise that day, and their volume in kilograms. */
  setCount: number;
  volume: number;
  /** The first workout of that day: somewhere for a point to lead. */
  workoutSessionId: string;
};

export type StrengthProgress = {
  /** One point per day trained, oldest first — the chart, left to right. */
  points: StrengthPoint[];
  /** The heaviest day in the range, and the most recent one. */
  best: StrengthPoint | null;
  latest: StrengthPoint | null;
  /**
   * Heaviest set on the last day minus the first, kilograms. Null with fewer
   * than two days, because one point is not a direction.
   */
  change: number | null;
};

/**
 * One exercise's top weight over the range: a point per day trained, plus the
 * heaviest and most recent of them.
 *
 * The plotted value is the heaviest working set actually performed that day —
 * measured, not estimated. A set of twelve that happened to be the heaviest bar
 * of the day is the point for that day.
 *
 * Goes through `getExercise` first for the same reason `getLastPerformance`
 * does — an id the user cannot see has to be `not_found`, not an empty chart,
 * which is a different claim.
 */
export async function getStrengthProgress(
  userId: string,
  exerciseId: string,
  range: Range = DEFAULT_RANGE,
  now: Date = new Date(),
): Promise<StrengthProgress> {
  await getExercise(userId, exerciseId);

  return strengthFrom(await findPerformedSets(userId, exerciseId, rangeStart(range, now)));
}

/** The shaping half, over rows already read. See `getExerciseProgress`. */
function strengthFrom(performed: PerformedSet[]): StrengthProgress {
  const points = toStrengthPoints(performed);
  const best = points.reduce<StrengthPoint | null>(
    (top, point) => (top === null || isHeavier(point, top) ? point : top),
    null,
  );

  return {
    points,
    best,
    latest: points.at(-1) ?? null,
    change: points.length < 2 ? null : points[points.length - 1].weight - points[0].weight,
  };
}

/**
 * Heavier bar wins; equal bars fall to the one done for more reps.
 *
 * The same order `heaviestFirst` gives the record query, so the top of this
 * chart and a personal record are the same set rather than two answers.
 */
function isHeavier(
  candidate: { weight: number; reps: number },
  incumbent: { weight: number; reps: number },
): boolean {
  return candidate.weight === incumbent.weight
    ? candidate.reps > incumbent.reps
    : candidate.weight > incumbent.weight;
}

/**
 * Sets, oldest first, collapsed to one point per *day*.
 *
 * Per day rather than per workout because that is the question — "what did you
 * lift on the 14th" — and because two sessions in one day would otherwise draw
 * as two points a few pixels apart. The rows arrive ordered by `started_at`, so
 * a map keyed by day preserves that order.
 */
function toStrengthPoints(performed: PerformedSet[]): StrengthPoint[] {
  const byDay = new Map<number, StrengthPoint>();

  for (const set of performed) {
    const day = startOfZonedDay(set.startedAt);
    const existing = byDay.get(day.getTime());

    if (!existing) {
      byDay.set(day.getTime(), {
        day,
        weight: set.weight,
        reps: set.reps,
        setCount: 1,
        volume: set.reps * set.weight,
        workoutSessionId: set.workoutSessionId,
      });
      continue;
    }

    existing.setCount += 1;
    existing.volume += set.reps * set.weight;

    if (isHeavier(set, existing)) {
      existing.weight = set.weight;
      existing.reps = set.reps;
    }
  }

  return [...byDay.values()];
}

export type RecentRecord = PersonalRecord & {
  /** Set inside the current week — what earns the badge on the card. */
  isNew: boolean;
};

/**
 * Records, most recently set first, capped.
 *
 * Ordering by date rather than by name is the whole point: alphabetical is a
 * reference table, and what a person wants to see is what they just beat. The
 * "new" flag reuses the week boundary every other read cuts on, so a record the
 * home screen counts in `personalRecords` is the same one badged here.
 */
export async function getRecentRecords(
  userId: string,
  options: { limit?: number } = {},
  now: Date = new Date(),
): Promise<RecentRecord[]> {
  const records = await findPersonalRecords(userId);
  const weekStart = startOfZonedWeek(now).getTime();

  return records
    .map((record) => ({ ...record, isNew: record.achievedAt.getTime() >= weekStart }))
    .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())
    .slice(0, options.limit ?? records.length);
}

export type BucketVolume = {
  /** The instant the bucket begins, cut in the app's timezone. */
  bucket: Date;
  volume: number;
  setCount: number;
};

export type MuscleShare = {
  muscleGroup: MuscleGroup;
  volume: number;
  setCount: number;
  /** 0–1 of the range's total volume. */
  share: number;
};

export type VolumeSeries = {
  /**
   * Every bucket of the range, oldest first — including the empty ones. A day
   * or a month without training is the most informative bar on the chart, and
   * dropping the row would quietly close the gap and redraw a broken month as a
   * steady one.
   */
  buckets: BucketVolume[];
  /** Working volume across the whole range, kilograms. */
  total: number;
  /** Working sets across the whole range. */
  setCount: number;
  /** Buckets with anything in them — "trained 9 of the last 30 days". */
  trained: number;
};

export type VolumeSummary = VolumeSeries & {
  /** Muscle groups over the whole range, heaviest first. */
  byMuscleGroup: MuscleShare[];
};

/**
 * A complete series from whatever fell in each bucket, zero-filled.
 *
 * Both volume reads end here, so "the last 30 days" is one calculation whether
 * the caller asked about everything or about one lift. The lookup is by
 * `getTime()` on a bucket start, which only works while every producer of a
 * bucket cuts it at the same instant — see `bucketStart` in src/lib/range.ts.
 */
function fillSeries(totals: Map<number, BucketVolume>, range: Range, now: Date): VolumeSeries {
  const buckets = rangeBuckets(range, now).map(
    (bucket) => totals.get(bucket.getTime()) ?? { bucket, volume: 0, setCount: 0 },
  );

  return {
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.volume, 0),
    setCount: buckets.reduce((sum, bucket) => sum + bucket.setCount, 0),
    trained: buckets.filter((bucket) => bucket.volume > 0).length,
  };
}

/**
 * The volume card and the balance card in one call: a complete bucket series,
 * and how the range split across muscle groups.
 *
 * Both come from one statement. Asking a second time for the totals would be a
 * second answer to the same question, and the per-bucket rows already carry
 * everything the shares need.
 */
export async function getVolumeSummary(
  userId: string,
  range: Range = DEFAULT_RANGE,
  now: Date = new Date(),
): Promise<VolumeSummary> {
  const points = await findVolumeByBucket(
    userId,
    rangeStart(range, now),
    RANGE_SHAPE[range].granularity,
  );

  const totals = new Map<number, BucketVolume>();
  const groups = new Map<MuscleGroup, MuscleShare>();
  let total = 0;

  for (const point of points) {
    const bucket = totals.get(point.bucket.getTime()) ?? {
      bucket: point.bucket,
      volume: 0,
      setCount: 0,
    };
    bucket.volume += point.volume;
    bucket.setCount += point.setCount;
    totals.set(point.bucket.getTime(), bucket);

    const group = groups.get(point.muscleGroup) ?? {
      muscleGroup: point.muscleGroup,
      volume: 0,
      setCount: 0,
      share: 0,
    };
    group.volume += point.volume;
    group.setCount += point.setCount;
    groups.set(point.muscleGroup, group);

    total += point.volume;
  }

  return {
    ...fillSeries(totals, range, now),
    byMuscleGroup: [...groups.values()]
      .map((group) => ({ ...group, share: total === 0 ? 0 : group.volume / total }))
      .sort((a, b) => b.volume - a.volume),
  };
}

/**
 * The same series, for one exercise.
 *
 * Built from `findPerformedSets` — the rows the strength card already reads —
 * rather than from a second `group by`. Bucketing them here means the bucket a
 * set lands in is decided by `bucketStart` and nothing else, which is one fewer
 * place for the boundary to be cut differently.
 *
 * There is no muscle-group split: one exercise belongs to exactly one group, so
 * the answer would be the total under a heading. The balance card stays whole.
 */
export async function getExerciseVolume(
  userId: string,
  exerciseId: string,
  range: Range = DEFAULT_RANGE,
  now: Date = new Date(),
): Promise<VolumeSeries> {
  await getExercise(userId, exerciseId);

  return volumeFrom(
    await findPerformedSets(userId, exerciseId, rangeStart(range, now)),
    range,
    now,
  );
}

/** The shaping half, over rows already read. See `getExerciseProgress`. */
function volumeFrom(performed: PerformedSet[], range: Range, now: Date): VolumeSeries {
  const granularity = RANGE_SHAPE[range].granularity;
  const totals = new Map<number, BucketVolume>();

  for (const set of performed) {
    const bucket = bucketStart(set.startedAt, granularity);
    const existing = totals.get(bucket.getTime()) ?? { bucket, volume: 0, setCount: 0 };
    existing.volume += set.reps * set.weight;
    existing.setCount += 1;
    totals.set(bucket.getTime(), existing);
  }

  return fillSeries(totals, range, now);
}

export type TopSet = {
  /** The workout it was done in, so the card can link to it. */
  workoutSessionId: string;
  performedAt: Date;
  /** The heaviest working set of that workout, kilograms. */
  weight: number;
  /** Working sets done at exactly that weight. */
  setCount: number;
  /** What those sets were done for, in the order they were done. */
  reps: number[];
  /** Every working set of the lift in that workout, at any weight. */
  totalSets: number;
};

/**
 * The heaviest bar this lift saw last time out, and how many sets stayed on it.
 *
 * Two numbers rather than one because on their own each is misleading: 100 kg
 * for a single and 100 kg for five sets are the same top set and not the same
 * session, and set count without the weight is just attendance.
 *
 * Equality on kilograms is exact on purpose. The column is `numeric(6, 2)` and
 * arrives as a number that came from a decimal string, so 102.5 is 102.5 — this
 * is not float arithmetic accumulating error, and a tolerance would quietly
 * merge 100 kg with 100.5 kg, which is a different set.
 *
 * Goes through `getExercise` first for the same reason the other by-exercise
 * reads do: an id this user cannot see is `not_found`, not "never performed".
 */
export async function getLastTopSet(userId: string, exerciseId: string): Promise<TopSet | null> {
  await getExercise(userId, exerciseId);

  return topSetFrom(await findLastWorkingSets(userId, exerciseId));
}

/** The shaping half, over rows already read. See `getExerciseProgress`. */
function topSetFrom(last: Awaited<ReturnType<typeof findLastWorkingSets>>): TopSet | null {
  if (!last || last.sets.length === 0) return null;

  const weight = Math.max(...last.sets.map((set) => set.weight));
  const top = last.sets.filter((set) => set.weight === weight);

  return {
    workoutSessionId: last.workoutSessionId,
    performedAt: last.startedAt,
    weight,
    setCount: top.length,
    reps: top.map((set) => set.reps),
    totalSets: last.sets.length,
  };
}

/**
 * Everything the progress screen shows about one lift, in one pass.
 *
 * The three reads above are each correct on their own and are what a route
 * handler wants. Called together they are not: `getStrengthProgress`,
 * `getExerciseVolume` and `getLastTopSet` each open with the same
 * `getExercise` ownership check, and the first two then ask `findPerformedSets`
 * the same question with the same arguments. That is six round trips to answer
 * with three, over a database in another region.
 *
 * So the guard runs once — it is a domain rule, not an accident: an id this
 * user cannot see is `not_found`, not an empty chart, which is a different
 * claim — and the two remaining reads go together rather than in sequence.
 * Strength and volume are then two shapes of the *same* rows, which also means
 * they can no longer disagree about what was performed.
 */
export async function getExerciseProgress(
  userId: string,
  exerciseId: string,
  range: Range = DEFAULT_RANGE,
  now: Date = new Date(),
): Promise<{ strength: StrengthProgress; volume: VolumeSeries; topSet: TopSet | null }> {
  await getExercise(userId, exerciseId);

  const [performed, last] = await Promise.all([
    findPerformedSets(userId, exerciseId, rangeStart(range, now)),
    findLastWorkingSets(userId, exerciseId),
  ]);

  return {
    strength: strengthFrom(performed),
    volume: volumeFrom(performed, range, now),
    topSet: topSetFrom(last),
  };
}

export type TrainingSummary = {
  week: WeekTotals & {
    /** Records whose best-ever set was set *this* week, not records held. */
    personalRecords: number;
  };
  /** Today's workout, running or finished. Null until one has been started. */
  today: SessionTotals | null;
  /** The last finished workout *before* today, so today's is never shown twice. */
  lastSession: SessionTotals | null;
};

/**
 * The home screen in one call: how this week is going, and the last workout
 * that finished.
 *
 * The record count is derived rather than queried. `findPersonalRecords`
 * already returns each exercise's best-ever working set and when it happened,
 * so a record "set this week" is one whose `achievedAt` falls inside the week —
 * asking the database the same question a second way would be a second
 * definition of a record, and they would drift.
 */
export async function getTrainingSummary(userId: string): Promise<TrainingSummary> {
  const [week, today, lastSession, records] = await Promise.all([
    findWeekTotals(userId),
    findTodaySession(userId),
    findLatestFinishedSession(userId, { excludeToday: true }),
    findPersonalRecords(userId),
  ]);

  return {
    week: {
      ...week,
      personalRecords: records.filter(
        (record) => record.achievedAt.getTime() >= week.weekStart.getTime(),
      ).length,
    },
    today,
    lastSession,
  };
}

export type MonthOfHistory = {
  /** The days with a workout on them, ascending. Days without one are absent. */
  days: MonthDay[];
  /** Sessions started in the month, finished or not. */
  workouts: number;
  /**
   * Whole minutes spent training across the month. A session still running
   * contributes nothing — it has no length yet, and counting the time since it
   * started would make the number climb while nobody is in the gym.
   */
  minutes: number;
};

/**
 * The history screen's calendar and the band under it, in one call.
 *
 * The totals are summed here rather than in a second statement: the per-day
 * rows are at most 31 of them and already carry everything the totals need, so
 * a `sum` over the same range would be a second definition of "this month".
 */
export async function getMonthOfHistory(
  userId: string,
  month: Month,
): Promise<MonthOfHistory> {
  const days = await findMonthOfSessions(userId, monthStart(month), monthEnd(month));

  return {
    days,
    workouts: days.reduce((total, day) => total + day.sessionCount, 0),
    minutes: Math.floor(days.reduce((total, day) => total + day.seconds, 0) / 60),
  };
}
