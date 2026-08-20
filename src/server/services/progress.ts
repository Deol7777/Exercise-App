/**
 * Reading the log back: what was lifted last time, what the records are, and
 * how much work each muscle group has taken lately.
 *
 * Every function takes the acting user id first, the same as
 * services/training.ts, and knows nothing about HTTP.
 */
import {
  findLastPerformance,
  findLatestFinishedSession,
  findPersonalRecords,
  findTodaySession,
  findWeekTotals,
  findWeeklyVolume,
  type LastPerformance,
  type PersonalRecord,
  type SessionTotals,
  type WeekTotals,
  type WeeklyVolumePoint,
} from "../db/queries/progress";
import { getExercise } from "./exercises";

export type { LastPerformance, PersonalRecord, SessionTotals, WeekTotals, WeeklyVolumePoint };

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
