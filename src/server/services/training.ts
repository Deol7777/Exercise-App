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
  reorderExerciseEntries as reorderExerciseEntryRows,
  updateSet,
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

/**
 * The session in progress with its exercise entries and sets — the exact shape
 * the logging screen renders, so it is one call rather than "which one?"
 * followed by "and what is in it?".
 */
export async function getActiveWorkoutSessionDetail(
  userId: string,
): Promise<WorkoutSessionDetail | null> {
  const active = await findActiveWorkoutSession(userId);
  if (!active) return null;

  return findWorkoutSessionDetail(userId, active.id);
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

/**
 * Puts a session's exercise entries in the given order. The body must list
 * every entry exactly once — a partial list is rejected rather than guessed at,
 * because "move this one to the front" and "delete the rest" would otherwise be
 * the same request.
 *
 * A side effect worth knowing: this also closes any gaps left by deletions,
 * because the new positions are 1..n.
 */
export async function reorderExerciseEntries(
  userId: string,
  workoutSessionId: string,
  orderedEntryIds: string[],
): Promise<{ id: string; position: number }[]> {
  const session = await findWorkoutSession(userId, workoutSessionId);
  if (!session) throw new NotFoundError("That workout session does not exist.");

  const reordered = await reorderExerciseEntryRows(userId, workoutSessionId, orderedEntryIds);
  if (!reordered) {
    throw new InvalidError("List every exercise in the session exactly once.");
  }

  return reordered;
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

/**
 * Corrects a set that was logged wrong — the common case being a weight typed
 * one digit out, noticed two sets later. `position` is not editable: order is
 * the database's, and a set moves by being deleted and logged again.
 */
export async function editSet(
  userId: string,
  setId: string,
  patch: { reps?: number; weight?: number; isWarmup?: boolean },
): Promise<SetRecord> {
  const updated = await updateSet(userId, setId, patch);
  if (!updated) throw new NotFoundError("That set does not exist.");
  return updated;
}

export async function removeSet(userId: string, setId: string): Promise<void> {
  const deleted = await deleteSetRow(userId, setId);
  if (!deleted) throw new NotFoundError("That set does not exist.");
}

export type ExerciseEntryDetail = {
  entry: ExerciseEntryRecord;
  session: WorkoutSessionRecord;
  /** 1-based place in the running order, and how many entries there are. */
  index: number;
  total: number;
  /** The neighbours, so the stepper screen can page without another lookup. */
  previousEntryId: string | null;
  nextEntryId: string | null;
};

/**
 * One exercise entry, with enough of its session to render the stepper screen:
 * which exercise, which sets, and "exercise 2 of 5".
 *
 * It reads the whole session rather than the entry alone because the position
 * and the neighbours are properties of the session's running order, not of the
 * row — deriving them from `position` would be wrong the moment a deletion
 * leaves a gap.
 */
export async function getExerciseEntry(
  userId: string,
  entryId: string,
): Promise<ExerciseEntryDetail> {
  const found = await findExerciseEntry(userId, entryId);
  if (!found) throw new NotFoundError("That exercise entry does not exist.");

  const detail = await findWorkoutSessionDetail(userId, found.workoutSessionId);
  if (!detail) throw new NotFoundError("That exercise entry does not exist.");

  const index = detail.exercises.findIndex((candidate) => candidate.id === entryId);
  if (index < 0) throw new NotFoundError("That exercise entry does not exist.");

  const { exercises, ...session } = detail;

  return {
    entry: exercises[index],
    session,
    index: index + 1,
    total: exercises.length,
    previousEntryId: index > 0 ? exercises[index - 1].id : null,
    nextEntryId: index < exercises.length - 1 ? exercises[index + 1].id : null,
  };
}
