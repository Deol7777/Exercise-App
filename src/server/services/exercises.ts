/**
 * The exercise catalog: reading what a user may see, and adding their own.
 *
 * Knows nothing about HTTP. The `userId` it takes always originates from the
 * auth session — see currentUserId() in src/server/auth.ts.
 */
import type { MuscleGroup } from "@/lib/muscle-groups";

import { isUniqueViolation } from "../db/pg-errors";
import {
  findVisibleExercise,
  insertCustomExercise,
  listVisibleExercises,
  type ExerciseRecord,
} from "../db/queries/exercises";
import { ConflictError, NotFoundError } from "../errors";

export type { ExerciseRecord };

/** Global (seeded) exercises plus this user's own, never anyone else's. */
export function listExercises(userId: string, options: { search?: string } = {}) {
  return listVisibleExercises(userId, options);
}

export async function getExercise(userId: string, exerciseId: string): Promise<ExerciseRecord> {
  const exercise = await findVisibleExercise(userId, exerciseId);
  if (!exercise) throw new NotFoundError("That exercise does not exist.");
  return exercise;
}

/**
 * A custom exercise is private to its owner. The partial unique index
 * `exercises_owner_name_unique` is what actually enforces one name per user;
 * catching its violation is more reliable than a check-then-insert, which two
 * concurrent requests can both pass.
 */
export async function createCustomExercise(
  userId: string,
  input: { name: string; muscleGroup: MuscleGroup },
): Promise<ExerciseRecord> {
  try {
    return await insertCustomExercise({ ownerId: userId, ...input });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("You already have an exercise with that name.");
    }
    throw error;
  }
}
