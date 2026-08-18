/**
 * Data access for the exercise catalog.
 *
 * Every read goes through `visibleTo(userId)`. A query that forgets it returns
 * other users' private custom exercises, which is why the filter is a shared
 * helper and never written out by hand at a call site.
 */
import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";

import type { MuscleGroup } from "@/lib/muscle-groups";

import { db } from "..";
import { exercises } from "../schema";

export type ExerciseRecord = {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  /** True when this user owns the row; false for a seeded global exercise. */
  isCustom: boolean;
};

/** `owner_id IS NULL OR owner_id = <session user>` — the catalog visibility rule. */
const visibleTo = (userId: string) =>
  or(isNull(exercises.ownerId), eq(exercises.ownerId, userId)) as SQL;

const selection = {
  id: exercises.id,
  name: exercises.name,
  muscleGroup: exercises.muscleGroup,
  isCustom: sql<boolean>`${exercises.ownerId} is not null`,
};

export async function listVisibleExercises(
  userId: string,
  options: { search?: string } = {},
): Promise<ExerciseRecord[]> {
  const search = options.search?.trim();

  return db
    .select(selection)
    .from(exercises)
    .where(
      search
        ? and(visibleTo(userId), sql`${exercises.name} ilike ${"%" + search + "%"}`)
        : visibleTo(userId),
    )
    .orderBy(asc(exercises.name));
}

export async function findVisibleExercise(
  userId: string,
  exerciseId: string,
): Promise<ExerciseRecord | null> {
  const [row] = await db
    .select(selection)
    .from(exercises)
    .where(and(eq(exercises.id, exerciseId), visibleTo(userId)))
    .limit(1);

  return row ?? null;
}

export async function insertCustomExercise(input: {
  ownerId: string;
  name: string;
  muscleGroup: MuscleGroup;
}): Promise<ExerciseRecord> {
  const [row] = await db.insert(exercises).values(input).returning(selection);
  return row;
}
