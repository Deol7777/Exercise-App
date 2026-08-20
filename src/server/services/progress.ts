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

import {
  findLastPerformance,
  findLatestFinishedSession,
  findMonthOfSessions,
  findPersonalRecords,
  findTodaySession,
  findWeekTotals,
  findWeeklyVolume,
  type LastPerformance,
  type MonthDay,
  type PersonalRecord,
  type SessionTotals,
  type WeekTotals,
  type WeeklyVolumePoint,
} from "../db/queries/progress";
import { getExercise } from "./exercises";

export type {
  LastPerformance,
  MonthDay,
  PersonalRecord,
  SessionTotals,
  WeekTotals,
  WeeklyVolumePoint,
};

/** Bounded so a hand-written query string cannot ask for an unbounded scan. */
const MIN_WEEKS = 1;
const MAX_WEEKS = 52;
export const DEFAULT_WEEKS = 8;

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

export function getWeeklyVolume(
  userId: string,
  weeks: number = DEFAULT_WEEKS,
): Promise<WeeklyVolumePoint[]> {
  const bounded = Math.min(Math.max(Math.trunc(weeks) || DEFAULT_WEEKS, MIN_WEEKS), MAX_WEEKS);
  return findWeeklyVolume(userId, bounded);
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
