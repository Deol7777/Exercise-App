/**
 * Data access for the logging model: workout session -> exercise entry -> set.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. Every lookup is scoped by the acting user id, joining back to
 *    `workout_sessions.user_id` for the rows that do not carry it themselves.
 *    A miss and "belongs to somebody else" are the same result on purpose.
 * 2. `position` is assigned here, by the database, as `max(position) + 1`
 *    within one statement — never taken from the request.
 *
 * `sets.weight` is `numeric`, which the pg driver hands back as a *string*.
 * This is the one layer that converts it, so nothing above ever sees the string.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { MuscleGroup } from "@/lib/muscle-groups";

import { db } from "..";
import { exercises, sessionExercises, sets, workoutSessions } from "../schema";

export type WorkoutSessionRecord = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
};

export type WorkoutSessionSummary = WorkoutSessionRecord & {
  exerciseCount: number;
  setCount: number;
};

export type SetRecord = {
  id: string;
  position: number;
  reps: number;
  /** Kilograms, as a number. Converted from the driver's string right here. */
  weight: number;
  isWarmup: boolean;
};

export type ExerciseEntryRecord = {
  id: string;
  position: number;
  notes: string | null;
  exercise: { id: string; name: string; muscleGroup: MuscleGroup };
  sets: SetRecord[];
};

export type WorkoutSessionDetail = WorkoutSessionRecord & {
  exercises: ExerciseEntryRecord[];
};

const sessionColumns = {
  id: workoutSessions.id,
  startedAt: workoutSessions.startedAt,
  endedAt: workoutSessions.endedAt,
  notes: workoutSessions.notes,
};

/** The driver returns `numeric` as a string; this is the only place it stops being one. */
const toKilograms = (weight: string) => Number(weight);

const nextPosition = (column: typeof sessionExercises.position | typeof sets.position, scope: ReturnType<typeof eq>) =>
  sql<number>`(select coalesce(max(${column}), 0) + 1 from ${column.table} where ${scope})`;

// --- workout sessions -------------------------------------------------------

export async function insertWorkoutSession(input: {
  userId: string;
  startedAt?: Date;
  notes?: string | null;
}): Promise<WorkoutSessionRecord> {
  const [row] = await db
    .insert(workoutSessions)
    .values({
      userId: input.userId,
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      notes: input.notes ?? null,
    })
    .returning(sessionColumns);

  return row;
}

export async function findWorkoutSession(
  userId: string,
  workoutSessionId: string,
): Promise<WorkoutSessionRecord | null> {
  const [row] = await db
    .select(sessionColumns)
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, workoutSessionId), eq(workoutSessions.userId, userId)))
    .limit(1);

  return row ?? null;
}

/** The one still running, if any. `ended_at IS NULL` is what "in progress" means. */
export async function findActiveWorkoutSession(
  userId: string,
): Promise<WorkoutSessionRecord | null> {
  const [row] = await db
    .select(sessionColumns)
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.endedAt)))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);

  return row ?? null;
}

export async function listWorkoutSessions(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<WorkoutSessionSummary[]> {
  const entries = db
    .select({
      workoutSessionId: sessionExercises.workoutSessionId,
      exerciseCount: sql<number>`count(distinct ${sessionExercises.id})::int`.as("exercise_count"),
      setCount: sql<number>`count(${sets.id})::int`.as("set_count"),
    })
    .from(sessionExercises)
    .leftJoin(sets, eq(sets.sessionExerciseId, sessionExercises.id))
    .groupBy(sessionExercises.workoutSessionId)
    .as("entry_counts");

  return db
    .select({
      ...sessionColumns,
      exerciseCount: sql<number>`coalesce(${entries.exerciseCount}, 0)::int`,
      setCount: sql<number>`coalesce(${entries.setCount}, 0)::int`,
    })
    .from(workoutSessions)
    .leftJoin(entries, eq(entries.workoutSessionId, workoutSessions.id))
    .where(eq(workoutSessions.userId, userId))
    .orderBy(desc(workoutSessions.startedAt))
    .limit(options.limit ?? 30)
    .offset(options.offset ?? 0);
}

export async function updateWorkoutSession(
  userId: string,
  workoutSessionId: string,
  patch: { endedAt?: Date | null; notes?: string | null },
): Promise<WorkoutSessionRecord | null> {
  const [row] = await db
    .update(workoutSessions)
    .set(patch)
    .where(and(eq(workoutSessions.id, workoutSessionId), eq(workoutSessions.userId, userId)))
    .returning(sessionColumns);

  return row ?? null;
}

/** Cascades to exercise entries and sets, by the foreign keys. */
export async function deleteWorkoutSession(
  userId: string,
  workoutSessionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, workoutSessionId), eq(workoutSessions.userId, userId)))
    .returning({ id: workoutSessions.id });

  return rows.length > 0;
}

// --- exercise entries -------------------------------------------------------

export async function insertExerciseEntry(input: {
  workoutSessionId: string;
  exerciseId: string;
  notes?: string | null;
}): Promise<{ id: string; position: number; notes: string | null }> {
  const [row] = await db
    .insert(sessionExercises)
    .values({
      workoutSessionId: input.workoutSessionId,
      exerciseId: input.exerciseId,
      notes: input.notes ?? null,
      position: nextPosition(
        sessionExercises.position,
        eq(sessionExercises.workoutSessionId, input.workoutSessionId),
      ),
    })
    .returning({
      id: sessionExercises.id,
      position: sessionExercises.position,
      notes: sessionExercises.notes,
    });

  return row;
}

/** Scoped by joining back to the owning workout session. */
export async function findExerciseEntry(
  userId: string,
  entryId: string,
): Promise<{ id: string; workoutSessionId: string } | null> {
  const [row] = await db
    .select({ id: sessionExercises.id, workoutSessionId: sessionExercises.workoutSessionId })
    .from(sessionExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(and(eq(sessionExercises.id, entryId), eq(workoutSessions.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function deleteExerciseEntry(userId: string, entryId: string): Promise<boolean> {
  const entry = await findExerciseEntry(userId, entryId);
  if (!entry) return false;

  await db.delete(sessionExercises).where(eq(sessionExercises.id, entryId));
  return true;
}

// --- sets -------------------------------------------------------------------

export async function insertSet(input: {
  sessionExerciseId: string;
  reps: number;
  weight: number;
  isWarmup: boolean;
}): Promise<SetRecord> {
  const [row] = await db
    .insert(sets)
    .values({
      sessionExerciseId: input.sessionExerciseId,
      reps: input.reps,
      /** numeric wants a string on the way in, too. */
      weight: input.weight.toFixed(2),
      isWarmup: input.isWarmup,
      position: nextPosition(sets.position, eq(sets.sessionExerciseId, input.sessionExerciseId)),
    })
    .returning({
      id: sets.id,
      position: sets.position,
      reps: sets.reps,
      weight: sets.weight,
      isWarmup: sets.isWarmup,
    });

  return { ...row, weight: toKilograms(row.weight) };
}

export async function updateSet(
  userId: string,
  setId: string,
  patch: { reps?: number; weight?: number; isWarmup?: boolean },
): Promise<SetRecord | null> {
  const found = await findSet(userId, setId);
  if (!found) return null;

  const [row] = await db
    .update(sets)
    .set({
      ...(patch.reps === undefined ? {} : { reps: patch.reps }),
      /** numeric wants a string on the way in, the same as an insert. */
      ...(patch.weight === undefined ? {} : { weight: patch.weight.toFixed(2) }),
      ...(patch.isWarmup === undefined ? {} : { isWarmup: patch.isWarmup }),
    })
    .where(eq(sets.id, setId))
    .returning({
      id: sets.id,
      position: sets.position,
      reps: sets.reps,
      weight: sets.weight,
      isWarmup: sets.isWarmup,
    });

  return { ...row, weight: toKilograms(row.weight) };
}

export async function findSet(
  userId: string,
  setId: string,
): Promise<{ id: string; sessionExerciseId: string } | null> {
  const [row] = await db
    .select({ id: sets.id, sessionExerciseId: sets.sessionExerciseId })
    .from(sets)
    .innerJoin(sessionExercises, eq(sessionExercises.id, sets.sessionExerciseId))
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.workoutSessionId))
    .where(and(eq(sets.id, setId), eq(workoutSessions.userId, userId)))
    .limit(1);

  return row ?? null;
}

export async function deleteSet(userId: string, setId: string): Promise<boolean> {
  const found = await findSet(userId, setId);
  if (!found) return false;

  await db.delete(sets).where(eq(sets.id, setId));
  return true;
}

// --- the read the logging screen is built on --------------------------------

/**
 * One workout session with its exercise entries and their sets, ordered. Three
 * statements rather than one join, so the nesting is assembled here instead of
 * de-duplicated from a wide result set.
 */
export async function findWorkoutSessionDetail(
  userId: string,
  workoutSessionId: string,
): Promise<WorkoutSessionDetail | null> {
  const session = await findWorkoutSession(userId, workoutSessionId);
  if (!session) return null;

  const entries = await db
    .select({
      id: sessionExercises.id,
      position: sessionExercises.position,
      notes: sessionExercises.notes,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      exerciseMuscleGroup: exercises.muscleGroup,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.workoutSessionId, workoutSessionId))
    .orderBy(asc(sessionExercises.position));

  const setRows = entries.length
    ? await db
        .select({
          id: sets.id,
          sessionExerciseId: sets.sessionExerciseId,
          position: sets.position,
          reps: sets.reps,
          weight: sets.weight,
          isWarmup: sets.isWarmup,
        })
        .from(sets)
        .where(
          inArray(
            sets.sessionExerciseId,
            entries.map((entry) => entry.id),
          ),
        )
        .orderBy(asc(sets.position))
    : [];

  const setsByEntry = new Map<string, SetRecord[]>();
  for (const row of setRows) {
    const list = setsByEntry.get(row.sessionExerciseId) ?? [];
    list.push({
      id: row.id,
      position: row.position,
      reps: row.reps,
      weight: toKilograms(row.weight),
      isWarmup: row.isWarmup,
    });
    setsByEntry.set(row.sessionExerciseId, list);
  }

  return {
    ...session,
    exercises: entries.map((entry) => ({
      id: entry.id,
      position: entry.position,
      notes: entry.notes,
      exercise: {
        id: entry.exerciseId,
        name: entry.exerciseName,
        muscleGroup: entry.exerciseMuscleGroup,
      },
      sets: setsByEntry.get(entry.id) ?? [],
    })),
  };
}
