/**
 * Data access for routines: a named, ordered list of exercises kept between
 * workouts.
 *
 * The same two rules as ./training.ts hold here:
 *
 * 1. Every lookup is scoped by the acting user id, joining back to
 *    `routines.user_id` for the rows that do not carry it themselves. A miss
 *    and "belongs to somebody else" are the same result on purpose.
 * 2. `position` is assigned by the database as `max(position) + 1` within one
 *    statement — never taken from the request. See ./positions.ts.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import type { MuscleGroup } from "@/lib/muscle-groups";

import { db } from "@/server/db/client";
import { exercises } from "@/server/db/schema/exercises";
import { routineExercises, routines } from "@/server/db/schema/routines";
import { nextPosition } from "./positions";

export type RoutineRecord = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RoutineSummary = RoutineRecord & {
  exerciseCount: number;
};

export type RoutineExerciseRecord = {
  id: string;
  position: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: MuscleGroup };
};

export type RoutineDetail = RoutineRecord & {
  exercises: RoutineExerciseRecord[];
};

const routineColumns = {
  id: routines.id,
  name: routines.name,
  notes: routines.notes,
  createdAt: routines.createdAt,
  updatedAt: routines.updatedAt,
};

// --- routines ---------------------------------------------------------------

export async function insertRoutine(input: {
  userId: string;
  name: string;
  notes?: string | null;
}): Promise<RoutineRecord> {
  const [row] = await db
    .insert(routines)
    .values({ userId: input.userId, name: input.name, notes: input.notes ?? null })
    .returning(routineColumns);

  return row;
}

/**
 * A whole routine and its exercises in one transaction, positions 1..n in the
 * order given.
 *
 * Copying a prebuilt routine is the one write that knows every line up front,
 * so it does not go through `nextPosition`: the routine is brand new, nothing
 * else can be inserting into it, and a half-copied routine is not a thing worth
 * being able to produce. A duplicate name raises the same
 * `routines_user_name_unique` violation `insertRoutine` does, and rolls the
 * exercises back with it.
 */
export async function insertRoutineWithExercises(input: {
  userId: string;
  name: string;
  notes?: string | null;
  exercises: { exerciseId: string; notes?: string | null }[];
}): Promise<RoutineRecord> {
  return db.transaction(async (tx) => {
    const [routine] = await tx
      .insert(routines)
      .values({ userId: input.userId, name: input.name, notes: input.notes ?? null })
      .returning(routineColumns);

    if (input.exercises.length > 0) {
      await tx.insert(routineExercises).values(
        input.exercises.map((exercise, index) => ({
          routineId: routine.id,
          exerciseId: exercise.exerciseId,
          notes: exercise.notes ?? null,
          position: index + 1,
        })),
      );
    }

    return routine;
  });
}

export async function findRoutine(userId: string, routineId: string): Promise<RoutineRecord | null> {
  const [row] = await db
    .select(routineColumns)
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Alphabetical rather than newest-first: the list is short, it is read to find
 * a routine you already know the name of, and a stable order means the row you
 * reached for last time has not moved.
 */
export async function listRoutines(userId: string): Promise<RoutineSummary[]> {
  const counts = db
    .select({
      routineId: routineExercises.routineId,
      exerciseCount: sql<number>`count(*)`.as("exercise_count"),
    })
    .from(routineExercises)
    .groupBy(routineExercises.routineId)
    .as("exercise_counts");

  const rows = await db
    .select({ ...routineColumns, exerciseCount: counts.exerciseCount })
    .from(routines)
    .leftJoin(counts, eq(counts.routineId, routines.id))
    .where(eq(routines.userId, userId))
    .orderBy(asc(routines.name));

  return rows.map((row) => ({ ...row, exerciseCount: Number(row.exerciseCount ?? 0) }));
}

export async function updateRoutine(
  userId: string,
  routineId: string,
  patch: { name?: string; notes?: string | null },
): Promise<RoutineRecord | null> {
  const [row] = await db
    .update(routines)
    .set({
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.notes === undefined ? {} : { notes: patch.notes }),
    })
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .returning(routineColumns);

  return row ?? null;
}

/** Cascades to `routine_exercises` via the foreign key. */
export async function deleteRoutine(userId: string, routineId: string): Promise<boolean> {
  const deleted = await db
    .delete(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .returning({ id: routines.id });

  return deleted.length > 0;
}

/** Two statements rather than one wide join, matching `findWorkoutSessionDetail`. */
export async function findRoutineDetail(
  userId: string,
  routineId: string,
): Promise<RoutineDetail | null> {
  const routine = await findRoutine(userId, routineId);
  if (!routine) return null;

  const rows = await db
    .select({
      id: routineExercises.id,
      position: routineExercises.position,
      notes: routineExercises.notes,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineId, routineId))
    .orderBy(asc(routineExercises.position));

  return {
    ...routine,
    exercises: rows.map((row) => ({
      id: row.id,
      position: row.position,
      notes: row.notes,
      exercise: { id: row.exerciseId, name: row.exerciseName, muscleGroup: row.muscleGroup },
    })),
  };
}

// --- routine exercises ------------------------------------------------------

/** Not user-scoped: the caller has already verified the routine is theirs. */
export async function insertRoutineExercise(input: {
  routineId: string;
  exerciseId: string;
  notes?: string | null;
}): Promise<{ id: string; position: number; notes: string | null }> {
  const [row] = await db
    .insert(routineExercises)
    .values({
      routineId: input.routineId,
      exerciseId: input.exerciseId,
      notes: input.notes ?? null,
      position: nextPosition(
        routineExercises.position,
        eq(routineExercises.routineId, input.routineId),
      ),
    })
    .returning({
      id: routineExercises.id,
      position: routineExercises.position,
      notes: routineExercises.notes,
    });

  return row;
}

/** Scoped by joining back to the owning routine. */
export async function findRoutineExercise(
  userId: string,
  routineExerciseId: string,
): Promise<{ id: string; routineId: string } | null> {
  const [row] = await db
    .select({ id: routineExercises.id, routineId: routineExercises.routineId })
    .from(routineExercises)
    .innerJoin(routines, eq(routines.id, routineExercises.routineId))
    .where(and(eq(routineExercises.id, routineExerciseId), eq(routines.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function deleteRoutineExercise(
  userId: string,
  routineExerciseId: string,
): Promise<boolean> {
  const line = await findRoutineExercise(userId, routineExerciseId);
  if (!line) return false;

  await db.delete(routineExercises).where(eq(routineExercises.id, routineExerciseId));
  return true;
}

/**
 * Rewrites the order of a routine's exercises in one transaction.
 *
 * The same shape as `reorderExerciseEntries` in ./training.ts, for the same
 * reasons: `routine_exercises_position_unique` is not deferrable, so positions
 * cannot be written straight to their new values — the first write would
 * collide with a row that has not moved yet. Every row is shifted above the
 * current maximum first, then written down. Negative temporaries would be
 * simpler and are not available: `routine_exercises_position_positive` requires
 * `position >= 1`.
 *
 * `for update` locks the routine's rows for the length of the transaction, so
 * two reorders of the same routine serialise instead of interleaving.
 *
 * Returns null when the routine is not this user's, or when `orderedIds` is not
 * exactly the set of exercises it holds.
 */
export async function reorderRoutineExercises(
  userId: string,
  routineId: string,
  orderedIds: string[],
): Promise<{ id: string; position: number }[] | null> {
  return db.transaction(async (tx) => {
    const [routine] = await tx
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
      .limit(1);

    if (!routine) return null;

    const current = await tx
      .select({ id: routineExercises.id, position: routineExercises.position })
      .from(routineExercises)
      .where(eq(routineExercises.routineId, routineId))
      .for("update");

    const known = new Set(current.map((row) => row.id));
    const requested = new Set(orderedIds);
    const isPermutation =
      known.size === requested.size && [...requested].every((id) => known.has(id));

    if (!isPermutation) return null;
    if (current.length === 0) return [];

    /** Above every position in use, so the shift itself cannot collide. */
    const offset = Math.max(...current.map((row) => row.position)) + current.length;

    await tx
      .update(routineExercises)
      .set({ position: sql`${routineExercises.position} + ${offset}` })
      .where(eq(routineExercises.routineId, routineId));

    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(routineExercises)
        .set({ position: index + 1 })
        .where(eq(routineExercises.id, id));
    }

    return orderedIds.map((id, index) => ({ id, position: index + 1 }));
  });
}
