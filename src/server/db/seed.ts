/**
 * Seeds the global exercise catalog — rows with `owner_id IS NULL`, visible to
 * every user (ADR 0004). Users' own custom exercises are never touched here.
 *
 * Idempotent: re-running inserts nothing new, because the partial unique index
 * `exercises_global_name_unique` catches names that are already seeded. Safe to
 * run against any environment, including one that already holds training data.
 *
 *   npm run db:seed
 */
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { exercises } from "./schema";

process.loadEnvFile(".env.local");

type SeedExercise = (typeof GLOBAL_EXERCISES)[number];

/**
 * Deliberately a starting point, not a complete catalog: the movements a
 * general strength programme actually uses. A missing movement is not a
 * blocker — a user can add it as a custom exercise.
 */
const GLOBAL_EXERCISES = [
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

async function main() {
  if (!process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("DATABASE_URL_UNPOOLED is not set. Seeding uses the direct, non-pooled Neon string.");
  }

  /** Direct connection: this is an admin task, not request traffic. */
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const db = drizzle(pool);

  try {
    const before = await db.$count(exercises, isNull(exercises.ownerId));

    const inserted = await db
      .insert(exercises)
      .values(GLOBAL_EXERCISES.map((exercise: SeedExercise) => ({ ...exercise, ownerId: null })))
      .onConflictDoNothing()
      .returning({ name: exercises.name });

    const after = await db.$count(exercises, isNull(exercises.ownerId));

    console.log(
      `Global catalog: ${GLOBAL_EXERCISES.length} defined, ${inserted.length} inserted, ` +
        `${GLOBAL_EXERCISES.length - inserted.length} already present (${before} -> ${after} rows).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
