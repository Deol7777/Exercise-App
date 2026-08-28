/**
 * Routines: keeping a named, ordered list of exercises between workouts.
 *
 * A routine is a *plan*, not a record — see docs/glossary.md. Starting one is
 * `startWorkoutSessionFromRoutine` in ./training.ts, because what it produces
 * is a workout session.
 *
 * No HTTP here — plain values in, plain values out, typed domain errors on the
 * way. Every function takes the acting user id as its first argument, and every
 * lookup underneath is scoped by it, so a row belonging to somebody else is
 * reported as `not_found` rather than `forbidden`: the caller learns nothing
 * about what exists.
 */
import { isUniqueViolation } from "../db/pg-errors";
import {
  deleteRoutine as deleteRoutineRow,
  deleteRoutineExercise,
  findRoutine,
  findRoutineDetail,
  insertRoutine,
  insertRoutineExercise,
  listRoutines,
  reorderRoutineExercises as reorderRoutineExerciseRows,
  updateRoutine,
  type RoutineDetail,
  type RoutineExerciseRecord,
  type RoutineRecord,
  type RoutineSummary,
} from "../db/queries/routines";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { getExercise } from "./exercises";

export type { RoutineDetail, RoutineExerciseRecord, RoutineRecord, RoutineSummary };

export function listRoutinesFor(userId: string): Promise<RoutineSummary[]> {
  return listRoutines(userId);
}

export async function getRoutine(userId: string, routineId: string): Promise<RoutineDetail> {
  const routine = await findRoutineDetail(userId, routineId);
  if (!routine) throw new NotFoundError("That routine does not exist.");
  return routine;
}

/**
 * `routines_user_name_unique` is what actually enforces one name per user;
 * catching its violation is more reliable than a check-then-insert, which two
 * concurrent requests can both pass.
 */
export async function createRoutine(
  userId: string,
  input: { name: string; notes?: string },
): Promise<RoutineRecord> {
  try {
    return await insertRoutine({ userId, name: input.name, notes: input.notes ?? null });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("You already have a routine with that name.");
    }
    throw error;
  }
}

export async function editRoutine(
  userId: string,
  routineId: string,
  patch: { name?: string; notes?: string | null },
): Promise<RoutineRecord> {
  try {
    const updated = await updateRoutine(userId, routineId, patch);
    if (!updated) throw new NotFoundError("That routine does not exist.");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("You already have a routine with that name.");
    }
    throw error;
  }
}

export async function removeRoutine(userId: string, routineId: string): Promise<void> {
  const deleted = await deleteRoutineRow(userId, routineId);
  if (!deleted) throw new NotFoundError("That routine does not exist.");
}

/**
 * `getExercise` is doing more work than it looks: it is the catalog visibility
 * filter, and it is what turns another user's custom exercise into a 404 rather
 * than a line in your routine.
 */
export async function addRoutineExercise(
  userId: string,
  routineId: string,
  input: { exerciseId: string; notes?: string },
): Promise<RoutineExerciseRecord> {
  const routine = await findRoutine(userId, routineId);
  if (!routine) throw new NotFoundError("That routine does not exist.");

  const exercise = await getExercise(userId, input.exerciseId);

  const line = await insertRoutineExercise({
    routineId,
    exerciseId: exercise.id,
    notes: input.notes ?? null,
  });

  return {
    id: line.id,
    position: line.position,
    notes: line.notes,
    exercise: { id: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup },
  };
}

/**
 * Takes the whole new running order, not "move this one". A partial list is
 * rejected because "move this one to the front" and "delete the rest" would
 * otherwise be the same request.
 *
 * Side effect worth knowing: the new positions are 1..n, so this also closes
 * any gaps a deletion left behind.
 */
export async function reorderRoutineExercises(
  userId: string,
  routineId: string,
  orderedIds: string[],
): Promise<{ id: string; position: number }[]> {
  const routine = await findRoutine(userId, routineId);
  if (!routine) throw new NotFoundError("That routine does not exist.");

  const reordered = await reorderRoutineExerciseRows(userId, routineId, orderedIds);
  if (!reordered) throw new InvalidError("List every exercise in the routine exactly once.");

  return reordered;
}

export async function removeRoutineExercise(
  userId: string,
  routineExerciseId: string,
): Promise<void> {
  const deleted = await deleteRoutineExercise(userId, routineExerciseId);
  if (!deleted) throw new NotFoundError("That routine exercise does not exist.");
}
