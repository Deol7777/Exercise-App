/**
 * The muscle-group vocabulary, in one place.
 *
 * Client-safe on purpose: the `muscle_group` Postgres enum, the Zod schema that
 * validates a custom exercise and the <Select> that offers the choices all read
 * this list, so they cannot drift apart. Adding a value is a cheap migration;
 * removing or renaming one is not.
 */
export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full_body",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** For display only — the stored value is always the snake_case enum member. */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
  full_body: "Full body",
};
