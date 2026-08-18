/**
 * The training write path: start a workout session, add exercise entries to it,
 * log sets against those entries, finish it.
 *
 * No HTTP here — plain values in, plain values out, typed domain errors on the
 * way. Every function takes the acting user id as its first argument, and every
 * lookup underneath is scoped by it, so a row belonging to somebody else is
 * reported as `not_found` rather than `forbidden`: the caller learns nothing
 * about what exists.
 */
import {
  deleteExerciseEntry,
  deleteSet as deleteSetRow,
  deleteWorkoutSession as deleteWorkoutSessionRow,
  findActiveWorkoutSession,
  findExerciseEntry,
  findWorkoutSession,
  findWorkoutSessionDetail,
  insertExerciseEntry,
  insertSet,
  insertWorkoutSession,
  listWorkoutSessions,
  updateWorkoutSession,
  type ExerciseEntryRecord,
  type SetRecord,
  type WorkoutSessionDetail,
  type WorkoutSessionRecord,
  type WorkoutSessionSummary,
} from "../db/queries/training";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { getExercise } from "./exercises";

export type {
  ExerciseEntryRecord,
  SetRecord,
  WorkoutSessionDetail,
  WorkoutSessionRecord,
  WorkoutSessionSummary,
};

/**
 * Only one workout session may be in progress at a time. Two open sessions have
 * no meaning — you are in one gym — and allowing them makes "the current
 * session" ambiguous for every screen that asks for it.
 */
export async function startWorkoutSession(
  userId: string,
  input: { startedAt?: string; notes?: string } = {},
): Promise<WorkoutSessionRecord> {
  const active = await findActiveWorkoutSession(userId);
  if (active) {
    throw new ConflictError("A workout session is already in progress. Finish it first.");
  }

  const startedAt = input.startedAt ? new Date(input.startedAt) : undefined;
  if (startedAt && startedAt.getTime() > Date.now()) {
    throw new InvalidError("A workout session cannot start in the future.");
  }

  return insertWorkoutSession({ userId, startedAt, notes: input.notes ?? null });
}

export function getActiveWorkoutSession(userId: string): Promise<WorkoutSessionRecord | null> {
  return findActiveWorkoutSession(userId);
}

export function listWorkoutSessionsFor(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<WorkoutSessionSummary[]> {
  return listWorkoutSessions(userId, options);
}

export async function getWorkoutSession(
  userId: string,
  workoutSessionId: string,
): Promise<WorkoutSessionDetail> {
  const detail = await findWorkoutSessionDetail(userId, workoutSessionId);
  if (!detail) throw new NotFoundError("That workout session does not exist.");
  return detail;
}

/**
 * Patches notes and/or the end time. `endedAt: null` reopens a finished session
 * deliberately — a mis-tap on "Finish" should not cost a workout.
 */
export async function editWorkoutSession(
  userId: string,
  workoutSessionId: string,
  patch: { endedAt?: string | null; notes?: string | null },
): Promise<WorkoutSessionRecord> {
  const existing = await findWorkoutSession(userId, workoutSessionId);
  if (!existing) throw new NotFoundError("That workout session does not exist.");

  const endedAt = patch.endedAt === undefined ? undefined : patch.endedAt && new Date(patch.endedAt);

  /** The same rule as the `workout_sessions_ended_after_started` check, reported as a domain error rather than a database failure. */
  if (endedAt && endedAt.getTime() < existing.startedAt.getTime()) {
    throw new InvalidError("A workout session cannot end before it started.");
  }

  if (endedAt === null) {
    const active = await findActiveWorkoutSession(userId);
    if (active && active.id !== workoutSessionId) {
      throw new ConflictError("Another workout session is already in progress.");
    }
  }

  const updated = await updateWorkoutSession(userId, workoutSessionId, {
    ...(endedAt === undefined ? {} : { endedAt: endedAt || null }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
  });

  if (!updated) throw new NotFoundError("That workout session does not exist.");
  return updated;
}

/** Convenience for the common case: stop the clock now. */
export function finishWorkoutSession(userId: string, workoutSessionId: string) {
  return editWorkoutSession(userId, workoutSessionId, { endedAt: new Date().toISOString() });
}

export async function removeWorkoutSession(
  userId: string,
  workoutSessionId: string,
): Promise<void> {
  const deleted = await deleteWorkoutSessionRow(userId, workoutSessionId);
  if (!deleted) throw new NotFoundError("That workout session does not exist.");
}

/**
 * Adds one performance of a catalog exercise to a session. Both halves are
 * checked against the acting user: the session must be theirs, and the exercise
 * must be global or their own custom one.
 */
export async function addExerciseEntry(
  userId: string,
  workoutSessionId: string,
  input: { exerciseId: string; notes?: string },
): Promise<ExerciseEntryRecord> {
  const session = await findWorkoutSession(userId, workoutSessionId);
  if (!session) throw new NotFoundError("That workout session does not exist.");

  const exercise = await getExercise(userId, input.exerciseId);

  const entry = await insertExerciseEntry({
    workoutSessionId,
    exerciseId: exercise.id,
    notes: input.notes ?? null,
  });

  return {
    ...entry,
    exercise: { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup },
    sets: [],
  };
}

export async function removeExerciseEntry(userId: string, entryId: string): Promise<void> {
  const deleted = await deleteExerciseEntry(userId, entryId);
  if (!deleted) throw new NotFoundError("That exercise entry does not exist.");
}

/**
 * Logs one set. Weight is kilograms — conversion from a user's display unit
 * happens at the edge, never here.
 */
export async function logSet(
  userId: string,
  entryId: string,
  input: { reps: number; weight: number; isWarmup?: boolean },
): Promise<SetRecord> {
  const entry = await findExerciseEntry(userId, entryId);
  if (!entry) throw new NotFoundError("That exercise entry does not exist.");

  return insertSet({
    sessionExerciseId: entry.id,
    reps: input.reps,
    weight: input.weight,
    isWarmup: input.isWarmup ?? false,
  });
}

export async function removeSet(userId: string, setId: string): Promise<void> {
  const deleted = await deleteSetRow(userId, setId);
  if (!deleted) throw new NotFoundError("That set does not exist.");
}
