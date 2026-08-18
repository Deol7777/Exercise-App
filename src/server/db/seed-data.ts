/**
 * The global exercise catalog: the rows every user can see (`owner_id IS NULL`).
 *
 * Separate from seed.ts so that both the CLI (`npm run db:seed`, against Neon
 * with the direct URL) and the test suite (against the local Docker Postgres,
 * ADR 0009) seed from exactly one list. Nothing here opens a connection.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { exercises } from "./schema";

export type SeedExercise = (typeof GLOBAL_EXERCISES)[number];

/**
 * Deliberately a starting point, not a complete catalog: the movements a
 * general strength programme actually uses. A missing movement is not a
 * blocker — a user can add it as a custom exercise.
 */
export const GLOBAL_EXERCISES = [
  // Chest
  { name: "Barbell Bench Press", muscleGroup: "chest" },
  { name: "Incline Barbell Bench Press", muscleGroup: "chest" },
  { name: "Dumbbell Bench Press", muscleGroup: "chest" },
  { name: "Incline Dumbbell Press", muscleGroup: "chest" },
  { name: "Cable Fly", muscleGroup: "chest" },
  { name: "Dip", muscleGroup: "chest" },
  { name: "Push-Up", muscleGroup: "chest" },
  // Back
  { name: "Deadlift", muscleGroup: "back" },
  { name: "Barbell Row", muscleGroup: "back" },
  { name: "Pendlay Row", muscleGroup: "back" },
  { name: "Dumbbell Row", muscleGroup: "back" },
  { name: "Pull-Up", muscleGroup: "back" },
  { name: "Chin-Up", muscleGroup: "back" },
  { name: "Lat Pulldown", muscleGroup: "back" },
  { name: "Seated Cable Row", muscleGroup: "back" },
  { name: "Face Pull", muscleGroup: "back" },
  // Shoulders
  { name: "Overhead Press", muscleGroup: "shoulders" },
  { name: "Seated Dumbbell Shoulder Press", muscleGroup: "shoulders" },
  { name: "Arnold Press", muscleGroup: "shoulders" },
  { name: "Lateral Raise", muscleGroup: "shoulders" },
  { name: "Rear Delt Fly", muscleGroup: "shoulders" },
  { name: "Upright Row", muscleGroup: "shoulders" },
  // Biceps
  { name: "Barbell Curl", muscleGroup: "biceps" },
  { name: "Dumbbell Curl", muscleGroup: "biceps" },
  { name: "Hammer Curl", muscleGroup: "biceps" },
  { name: "Preacher Curl", muscleGroup: "biceps" },
  { name: "Cable Curl", muscleGroup: "biceps" },
  // Triceps
  { name: "Close-Grip Bench Press", muscleGroup: "triceps" },
  { name: "Triceps Pushdown", muscleGroup: "triceps" },
  { name: "Overhead Triceps Extension", muscleGroup: "triceps" },
  { name: "Skull Crusher", muscleGroup: "triceps" },
  // Forearms
  { name: "Wrist Curl", muscleGroup: "forearms" },
  { name: "Farmer's Walk", muscleGroup: "forearms" },
  // Quads
  { name: "Back Squat", muscleGroup: "quads" },
  { name: "Front Squat", muscleGroup: "quads" },
  { name: "Leg Press", muscleGroup: "quads" },
  { name: "Bulgarian Split Squat", muscleGroup: "quads" },
  { name: "Walking Lunge", muscleGroup: "quads" },
  { name: "Leg Extension", muscleGroup: "quads" },
  { name: "Hack Squat", muscleGroup: "quads" },
  // Hamstrings
  { name: "Romanian Deadlift", muscleGroup: "hamstrings" },
  { name: "Stiff-Leg Deadlift", muscleGroup: "hamstrings" },
  { name: "Lying Leg Curl", muscleGroup: "hamstrings" },
  { name: "Seated Leg Curl", muscleGroup: "hamstrings" },
  { name: "Good Morning", muscleGroup: "hamstrings" },
  // Glutes
  { name: "Hip Thrust", muscleGroup: "glutes" },
  { name: "Glute Bridge", muscleGroup: "glutes" },
  { name: "Cable Kickback", muscleGroup: "glutes" },
  // Calves
  { name: "Standing Calf Raise", muscleGroup: "calves" },
  { name: "Seated Calf Raise", muscleGroup: "calves" },
  // Core
  { name: "Plank", muscleGroup: "core" },
  { name: "Hanging Leg Raise", muscleGroup: "core" },
  { name: "Cable Crunch", muscleGroup: "core" },
  { name: "Ab Wheel Rollout", muscleGroup: "core" },
  { name: "Russian Twist", muscleGroup: "core" },
  // Full body
  { name: "Power Clean", muscleGroup: "full_body" },
  { name: "Clean and Jerk", muscleGroup: "full_body" },
  { name: "Snatch", muscleGroup: "full_body" },
  { name: "Kettlebell Swing", muscleGroup: "full_body" },
  { name: "Burpee", muscleGroup: "full_body" },
] as const satisfies ReadonlyArray<{
  name: string;
  muscleGroup: (typeof exercises.muscleGroup.enumValues)[number];
}>;


/**
 * Idempotent: the partial unique index `exercises_global_name_unique` catches
 * names that are already seeded, so re-running inserts nothing new and touches
 * no user's custom exercises.
 */
export async function seedGlobalExercises(
  db: NodePgDatabase<Record<string, never>>,
): Promise<{ name: string }[]> {
  return db
    .insert(exercises)
    .values(GLOBAL_EXERCISES.map((exercise: SeedExercise) => ({ ...exercise, ownerId: null })))
    .onConflictDoNothing()
    .returning({ name: exercises.name });
}
