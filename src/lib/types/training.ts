/**
 * The shapes the training API puts on the wire, and therefore the shapes the
 * client works with.
 *
 * They deliberately mirror — rather than re-export — the records in
 * src/server/db/queries/training.ts: a client component may not import from
 * src/server/**, and the two differ anyway, because a timestamp is a `Date` in
 * the service layer and an ISO string once it has been through JSON.
 */
import type { MuscleGroup } from "../muscle-groups";

export type ExerciseSummary = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  /** True for this user's own exercise, false for a seeded global one. */
  isCustom: boolean;
};

export type LoggedSet = {
  id: string;
  position: number;
  reps: number;
  /** Kilograms. Already a number — the string the driver returns stops at the data-access layer. */
  weight: number;
  isWarmup: boolean;
};

export type LoggedExerciseEntry = {
  id: string;
  position: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: MuscleGroup };
  sets: LoggedSet[];
};

export type LoggedWorkoutSession = {
  id: string;
  /** ISO 8601. */
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  exercises: LoggedExerciseEntry[];
};

export type WorkoutSessionListItem = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  exerciseCount: number;
  setCount: number;
};
