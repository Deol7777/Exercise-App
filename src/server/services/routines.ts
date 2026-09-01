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
import {
  findPrebuiltRoutine,
  prebuiltRoutineName,
  type PrebuiltRoutine,
} from "@/lib/prebuilt-routines";

import { findGlobalExercisesByName } from "@/server/db/queries/exercises";
import { isUniqueViolation } from "@/server/db/pg-errors";
import {
  deleteRoutine as deleteRoutineRow,
  deleteRoutineExercise,
  findRoutine,
  findRoutineDetail,
  insertRoutine,
  insertRoutineExercise,
  insertRoutineWithExercises,
  listRoutines,
  reorderRoutineExercises as reorderRoutineExerciseRows,
  updateRoutine,
  type RoutineDetail,
  type RoutineExerciseRecord,
  type RoutineRecord,
  type RoutineSummary,
} from "@/server/db/queries/routines";
import { ConflictError, InvalidError, NotFoundError } from "@/server/errors";
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

/**
 * Copies one of the shipped programmes in src/lib/prebuilt-routines.ts into
 * this user's own routines.
 *
 * A *copy*, in the same sense as starting a routine: the new rows are theirs to
 * rename, reorder and delete, and nothing points back at the prebuilt one
 * afterwards. Changing the programme in that file cannot rewrite a routine
 * somebody already keeps.
 *
 * The prebuilt routine names its movements rather than pointing at ids, so this
 * resolves them against the *global* catalog — see `findGlobalExercisesByName`.
 * A name that is not there means the catalog has not been seeded, which is a
 * broken deployment rather than a bad request, so it is left as an ordinary
 * error and reported as a 500.
 */
export async function copyPrebuiltRoutine(
  userId: string,
  prebuiltId: string,
): Promise<RoutineRecord> {
  const { prebuilt, exercises } = await getPrebuiltRoutineLines(prebuiltId);

  try {
    return await insertRoutineWithExercises({
      userId,
      name: prebuiltRoutineName(prebuilt),
      notes: prebuilt.blurb,
      exercises,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`You already have a routine called ${prebuiltRoutineName(prebuilt)}.`);
    }
    throw error;
  }
}

/**
 * A prebuilt routine, with its movements resolved to catalog ids in the order
 * it lists them. One query for the lot, and duplicates are kept: 5/3/1 does the
 * same lift twice in a session, at two different prescriptions.
 *
 * Shared with `startWorkoutSessionFromPrebuiltRoutine` in ./training.ts, which
 * is the other thing a prebuilt routine can become — the two must agree on
 * exactly what "the exercises of this programme" means, so there is one
 * resolver rather than one each.
 */
export async function getPrebuiltRoutineLines(
  prebuiltId: string,
): Promise<{ prebuilt: PrebuiltRoutine; exercises: { exerciseId: string; notes: string }[] }> {
  const prebuilt = findPrebuiltRoutine(prebuiltId);
  if (!prebuilt) throw new NotFoundError("That prebuilt routine does not exist.");

  return { prebuilt, exercises: await resolveExercises(prebuilt) };
}

async function resolveExercises(
  prebuilt: PrebuiltRoutine,
): Promise<{ exerciseId: string; notes: string }[]> {
  const names = [...new Set(prebuilt.exercises.map((line) => line.exercise))];
  const found = await findGlobalExercisesByName(names);
  const idByName = new Map(found.map((exercise) => [exercise.name, exercise.id]));

  return prebuilt.exercises.map((line) => {
    const exerciseId = idByName.get(line.exercise);
    if (!exerciseId) {
      throw new Error(
        `Prebuilt routine "${prebuilt.slug}" names "${line.exercise}", which is not in the ` +
          "global exercise catalog. Run `npm run db:seed`.",
      );
    }
    return { exerciseId, notes: line.scheme };
  });
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
