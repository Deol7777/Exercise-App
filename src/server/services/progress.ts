/**
 * Reading the log back: what was lifted last time, what the records are, and
 * how much work each muscle group has taken lately.
 *
 * Every function takes the acting user id first, the same as
 * services/training.ts, and knows nothing about HTTP.
 */
import {
  findLastPerformance,
  findPersonalRecords,
  findWeeklyVolume,
  type LastPerformance,
  type PersonalRecord,
  type WeeklyVolumePoint,
} from "../db/queries/progress";
import { getExercise } from "./exercises";

export type { LastPerformance, PersonalRecord, WeeklyVolumePoint };

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
