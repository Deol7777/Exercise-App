/**
 * The prebuilt routines: established programmes, shipped with the app, that
 * somebody can copy into their own routines and start.
 *
 * Static data rather than rows. A prebuilt routine is *content* — it is the
 * same for every account, nobody edits it, and it changes when this file
 * changes — so putting it in the database would buy a migration and a seed
 * script and give nothing back. Copying one writes real `routines` and
 * `routine_exercises` rows owned by the user, and nothing links the copy back
 * here afterwards: editing this file cannot rewrite a routine somebody is
 * already running, for the same reason starting a routine cannot rewrite the
 * workout it produced.
 *
 * `exercise` is a name from the global catalog in
 * src/server/db/seed-data.ts, matched exactly. A typo here is a routine that
 * copies without one of its lifts, so `prebuilt-routines.test.ts` checks every
 * name against that list.
 *
 * Client-safe: imports nothing from src/server/**.
 */

export type PrebuiltExercise = {
  /** Exactly a global catalog name. */
  exercise: string;
  /** The sets-and-reps prescription, copied onto the routine exercise's notes. */
  scheme: string;
};

export type PrebuiltRoutine = {
  /** URL segment, and the id the copy endpoint takes. Stable — it is linkable. */
  slug: string;
  /** The programme this day belongs to: "StrongLifts 5×5". */
  program: string;
  /** The day within it: "Workout A", "Push". */
  day: string;
  /** One line on what the programme is for, shown under the name. */
  blurb: string;
  exercises: readonly PrebuiltExercise[];
};

/**
 * Well-known programmes, each broken into the days you actually walk into the
 * gym and do — because a routine here is one day's list, not a week's plan.
 * The schedule (which day follows which, how often) is the programme's
 * business and lives in the blurb, not in the model.
 */
export const PREBUILT_ROUTINES = [
  {
    slug: "stronglifts-5x5-a",
    program: "StrongLifts 5×5",
    day: "Workout A",
    blurb: "Three lifts, five sets of five, add 2.5 kg every session. Alternate A and B, three days a week.",
    exercises: [
      { exercise: "Back Squat", scheme: "5×5" },
      { exercise: "Barbell Bench Press", scheme: "5×5" },
      { exercise: "Barbell Row", scheme: "5×5" },
    ],
  },
  {
    slug: "stronglifts-5x5-b",
    program: "StrongLifts 5×5",
    day: "Workout B",
    blurb: "The other half of StrongLifts. One heavy set of deadlifts is the whole deadlift session.",
    exercises: [
      { exercise: "Back Squat", scheme: "5×5" },
      { exercise: "Overhead Press", scheme: "5×5" },
      { exercise: "Deadlift", scheme: "1×5" },
    ],
  },
  {
    slug: "starting-strength-a",
    program: "Starting Strength",
    day: "Day A",
    blurb: "Rippetoe's novice linear progression: three sets of five, squat every session.",
    exercises: [
      { exercise: "Back Squat", scheme: "3×5" },
      { exercise: "Barbell Bench Press", scheme: "3×5" },
      { exercise: "Deadlift", scheme: "1×5" },
    ],
  },
  {
    slug: "starting-strength-b",
    program: "Starting Strength",
    day: "Day B",
    blurb: "Press instead of bench, cleans instead of deadlifts. Alternate with Day A.",
    exercises: [
      { exercise: "Back Squat", scheme: "3×5" },
      { exercise: "Overhead Press", scheme: "3×5" },
      { exercise: "Power Clean", scheme: "5×3" },
    ],
  },
  {
    slug: "ppl-push",
    program: "Push Pull Legs",
    day: "Push",
    blurb: "Everything that presses: chest, shoulders, triceps. Run it three or six days a week.",
    exercises: [
      { exercise: "Barbell Bench Press", scheme: "4×6–8" },
      { exercise: "Overhead Press", scheme: "3×8" },
      { exercise: "Incline Dumbbell Press", scheme: "3×10" },
      { exercise: "Lateral Raise", scheme: "3×15" },
      { exercise: "Triceps Pushdown", scheme: "3×12" },
      { exercise: "Overhead Cable Triceps Extension", scheme: "3×12" },
    ],
  },
  {
    slug: "ppl-pull",
    program: "Push Pull Legs",
    day: "Pull",
    blurb: "Everything that pulls: back and biceps, opened by a heavy hinge.",
    exercises: [
      { exercise: "Deadlift", scheme: "3×5" },
      { exercise: "Pull-Up", scheme: "3× as many as you have" },
      { exercise: "Barbell Row", scheme: "4×8" },
      { exercise: "Seated Cable Row", scheme: "3×10" },
      { exercise: "Face Pull", scheme: "3×15" },
      { exercise: "Barbell Curl", scheme: "3×10" },
      { exercise: "Hammer Curl", scheme: "3×12" },
    ],
  },
  {
    slug: "ppl-legs",
    program: "Push Pull Legs",
    day: "Legs",
    blurb: "Quads, hamstrings, calves and a little core. The day people skip.",
    exercises: [
      { exercise: "Back Squat", scheme: "4×6–8" },
      { exercise: "Romanian Deadlift", scheme: "3×8" },
      { exercise: "Leg Press", scheme: "3×12" },
      { exercise: "Lying Leg Curl", scheme: "3×12" },
      { exercise: "Standing Calf Raise", scheme: "4×15" },
      { exercise: "Hanging Leg Raise", scheme: "3×12" },
    ],
  },
  {
    slug: "upper-lower-upper",
    program: "Upper / Lower",
    day: "Upper",
    blurb: "Four days a week, alternating upper and lower. Heavy compounds first, arms last.",
    exercises: [
      { exercise: "Barbell Bench Press", scheme: "4×6" },
      { exercise: "Barbell Row", scheme: "4×6" },
      { exercise: "Overhead Press", scheme: "3×8" },
      { exercise: "Lat Pulldown", scheme: "3×10" },
      { exercise: "Dumbbell Curl", scheme: "3×12" },
      { exercise: "Skull Crusher", scheme: "3×12" },
    ],
  },
  {
    slug: "upper-lower-lower",
    program: "Upper / Lower",
    day: "Lower",
    blurb: "The lower half of the split: a squat, a hinge, one leg at a time, then calves and core.",
    exercises: [
      { exercise: "Back Squat", scheme: "4×6" },
      { exercise: "Romanian Deadlift", scheme: "3×8" },
      { exercise: "Bulgarian Split Squat", scheme: "3×10" },
      { exercise: "Seated Leg Curl", scheme: "3×12" },
      { exercise: "Seated Calf Raise", scheme: "4×15" },
      { exercise: "Cable Crunch", scheme: "3×15" },
    ],
  },
  {
    slug: "arnold-chest-back",
    program: "Arnold Split",
    day: "Chest & Back",
    blurb: "High volume, opposing muscles in the same session. Six days a week, and it shows.",
    exercises: [
      { exercise: "Barbell Bench Press", scheme: "5×8" },
      { exercise: "Barbell Row", scheme: "5×8" },
      { exercise: "Incline Barbell Bench Press", scheme: "4×8" },
      { exercise: "Pull-Up", scheme: "4×10" },
      { exercise: "Cable Fly", scheme: "3×12" },
      { exercise: "Dip", scheme: "3×10" },
    ],
  },
  {
    slug: "arnold-shoulders-arms",
    program: "Arnold Split",
    day: "Shoulders & Arms",
    blurb: "Delts from three angles, then biceps and triceps until the sleeves complain.",
    exercises: [
      { exercise: "Overhead Press", scheme: "4×8" },
      { exercise: "Lateral Raise", scheme: "4×12" },
      { exercise: "Rear Delt Fly", scheme: "3×15" },
      { exercise: "Barbell Curl", scheme: "4×10" },
      { exercise: "Preacher Curl", scheme: "3×12" },
      { exercise: "Close-Grip Bench Press", scheme: "4×10" },
      { exercise: "Triceps Pushdown", scheme: "3×12" },
    ],
  },
  {
    slug: "arnold-legs-core",
    program: "Arnold Split",
    day: "Legs & Core",
    blurb: "The third day of the split: squats first, everything else in service of them.",
    exercises: [
      { exercise: "Back Squat", scheme: "5×8" },
      { exercise: "Leg Extension", scheme: "4×12" },
      { exercise: "Lying Leg Curl", scheme: "4×12" },
      { exercise: "Walking Lunge", scheme: "3×20 steps" },
      { exercise: "Standing Calf Raise", scheme: "5×15" },
      { exercise: "Sit-Up", scheme: "3×25" },
    ],
  },
  {
    slug: "531-bbb-squat",
    program: "5/3/1 Boring But Big",
    day: "Squat",
    blurb: "Wendler's template: work up to one hard top set, then five sets of ten at half the weight.",
    exercises: [
      { exercise: "Back Squat", scheme: "5/3/1 — 3 sets, last one for reps" },
      { exercise: "Back Squat", scheme: "5×10 at 50–60%" },
      { exercise: "Lying Leg Curl", scheme: "5×10" },
      { exercise: "Hanging Leg Raise", scheme: "5×15" },
    ],
  },
  {
    slug: "531-bbb-bench",
    program: "5/3/1 Boring But Big",
    day: "Bench",
    blurb: "Bench day. The 5×10 is the work; the top set is the measurement.",
    exercises: [
      { exercise: "Barbell Bench Press", scheme: "5/3/1 — 3 sets, last one for reps" },
      { exercise: "Barbell Bench Press", scheme: "5×10 at 50–60%" },
      { exercise: "Dumbbell Row", scheme: "5×10" },
      { exercise: "Triceps Pushdown", scheme: "5×15" },
    ],
  },
  {
    slug: "531-bbb-deadlift",
    program: "5/3/1 Boring But Big",
    day: "Deadlift",
    blurb: "Deadlift day. Reset on the floor between reps of the volume work.",
    exercises: [
      { exercise: "Deadlift", scheme: "5/3/1 — 3 sets, last one for reps" },
      { exercise: "Deadlift", scheme: "5×10 at 50–60%" },
      { exercise: "Hanging Leg Raise", scheme: "5×15" },
      { exercise: "Standing Calf Raise", scheme: "5×15" },
    ],
  },
  {
    slug: "531-bbb-press",
    program: "5/3/1 Boring But Big",
    day: "Press",
    blurb: "Overhead day, the slowest lift to move. Chin-ups between every set.",
    exercises: [
      { exercise: "Overhead Press", scheme: "5/3/1 — 3 sets, last one for reps" },
      { exercise: "Overhead Press", scheme: "5×10 at 50–60%" },
      { exercise: "Chin-Up", scheme: "5×10" },
      { exercise: "Dumbbell Curl", scheme: "5×15" },
    ],
  },
  {
    slug: "full-body-beginner",
    program: "Full Body",
    day: "Three days a week",
    blurb: "One session, repeated Monday, Wednesday and Friday. The least programme that still works.",
    exercises: [
      { exercise: "Back Squat", scheme: "3×8" },
      { exercise: "Barbell Bench Press", scheme: "3×8" },
      { exercise: "Barbell Row", scheme: "3×8" },
      { exercise: "Overhead Press", scheme: "3×10" },
      { exercise: "Romanian Deadlift", scheme: "3×10" },
      { exercise: "Plank", scheme: "3× 45 seconds" },
    ],
  },
] as const satisfies readonly PrebuiltRoutine[];

export type PrebuiltRoutineSlug = (typeof PREBUILT_ROUTINES)[number]["slug"];

export function findPrebuiltRoutine(slug: string): PrebuiltRoutine | null {
  return PREBUILT_ROUTINES.find((routine) => routine.slug === slug) ?? null;
}

/**
 * What a copy is called in somebody's own list. Programme *and* day, because
 * "Push" alone says nothing next to the other five routines they keep — and
 * because routine names are unique per user, so two programmes' "Day A" would
 * otherwise collide.
 */
export function prebuiltRoutineName(routine: PrebuiltRoutine): string {
  return `${routine.program} · ${routine.day}`;
}

/** The programmes, each with its days, in the order this file declares them. */
export function prebuiltPrograms(): { program: string; routines: PrebuiltRoutine[] }[] {
  const groups: { program: string; routines: PrebuiltRoutine[] }[] = [];

  for (const routine of PREBUILT_ROUTINES) {
    const group = groups.find((candidate) => candidate.program === routine.program);
    if (group) group.routines.push(routine);
    else groups.push({ program: routine.program, routines: [routine] });
  }

  return groups;
}
