/**
 * Fills one account with a year of plausible training, so the read screens —
 * /progress above all — have something to draw.
 *
 *   npm run db:seed:demo -- --email you@example.com
 *   npm run db:seed:demo -- --email you@example.com --weeks 26 --replace
 *
 * This is a development convenience and nothing else. It writes real rows to
 * whatever `DATABASE_URL_UNPOOLED` points at, so it refuses to touch an account
 * that already has workout sessions unless `--replace` is passed — and
 * `--replace` deletes that user's entire training log first.
 *
 * The data is deterministic: the same `--seed` produces the same year, so a
 * screenshot taken today can be reproduced tomorrow.
 *
 * What it models, roughly, is a four-day upper/lower-ish split run for a year:
 * weights that climb with diminishing returns, reps that wander inside a range,
 * a deload every eighth week, a couple of missed weeks, and warm-up sets that
 * every statistic in the app is supposed to ignore.
 */
import { eq, inArray, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/** Relative, not "@/": tsx runs this outside Next's resolver (see schema/exercises.ts). */
import { shiftZonedWeeks, startOfZonedWeek, zonedDate, zonedInstant } from "@/lib/time-zone";

import { users } from "@/server/db/schema/auth";
import { exercises } from "@/server/db/schema/exercises";
import { sessionExercises, sets, workoutSessions } from "@/server/db/schema/training";

process.loadEnvFile(".env.local");

/* ------------------------------------------------------------------ program */

type Movement = {
  /** Must name a *global* catalog exercise, exactly as seed-data.ts spells it. */
  name: string;
  /** Top working set on week zero, kilograms. */
  start: number;
  /** Kilograms added per week, before diminishing returns. */
  gain: number;
  /** Working rep range for the top set: [hardest, easiest]. */
  reps: [number, number];
  /** Working sets, before a deload takes one away. */
  sets: number;
  /** What the loading actually steps in — 2.5 kg bar, 2 kg dumbbell, 5 kg stack. */
  step: number;
  /** Warm-up sets, stored like any other set and excluded from every statistic. */
  warmups?: number;
};

type Day = {
  label: string;
  /** 0 = Monday. */
  weekday: number;
  movements: Movement[];
};

/**
 * Bodyweight movements are deliberately absent: a pull-up logged at zero
 * kilograms contributes zero volume, and a volume chart with a hole in it looks
 * like a bug rather than a training decision.
 */
const PROGRAM: Day[] = [
  {
    label: "Push",
    weekday: 0,
    movements: [
      { name: "Barbell Bench Press", start: 70, gain: 1.1, reps: [5, 8], sets: 4, step: 2.5, warmups: 2 },
      { name: "Overhead Press", start: 42.5, gain: 0.55, reps: [5, 8], sets: 3, step: 2.5, warmups: 1 },
      { name: "Incline Dumbbell Press", start: 26, gain: 0.35, reps: [8, 12], sets: 3, step: 2 },
      { name: "Cable Fly", start: 15, gain: 0.25, reps: [12, 15], sets: 3, step: 2.5 },
      { name: "Triceps Pushdown", start: 27.5, gain: 0.4, reps: [10, 14], sets: 3, step: 2.5 },
      { name: "Lateral Raise", start: 10, gain: 0.15, reps: [12, 16], sets: 3, step: 2 },
    ],
  },
  {
    label: "Pull",
    weekday: 1,
    movements: [
      { name: "Deadlift", start: 100, gain: 1.4, reps: [3, 6], sets: 3, step: 5, warmups: 3 },
      { name: "Barbell Row", start: 65, gain: 0.8, reps: [6, 10], sets: 3, step: 2.5, warmups: 1 },
      { name: "Lat Pulldown", start: 55, gain: 0.7, reps: [8, 12], sets: 3, step: 2.5 },
      { name: "Seated Cable Row", start: 55, gain: 0.7, reps: [8, 12], sets: 3, step: 2.5 },
      { name: "Barbell Curl", start: 30, gain: 0.3, reps: [8, 12], sets: 3, step: 2.5 },
      { name: "Face Pull", start: 20, gain: 0.25, reps: [12, 16], sets: 3, step: 2.5 },
    ],
  },
  {
    label: "Legs",
    weekday: 3,
    movements: [
      { name: "Back Squat", start: 90, gain: 1.3, reps: [4, 8], sets: 4, step: 2.5, warmups: 3 },
      { name: "Romanian Deadlift", start: 70, gain: 0.9, reps: [8, 10], sets: 3, step: 2.5, warmups: 1 },
      { name: "Leg Press", start: 140, gain: 2.2, reps: [10, 14], sets: 3, step: 5 },
      { name: "Lying Leg Curl", start: 40, gain: 0.5, reps: [10, 14], sets: 3, step: 2.5 },
      { name: "Hip Thrust", start: 80, gain: 1.2, reps: [8, 12], sets: 3, step: 5 },
      { name: "Standing Calf Raise", start: 60, gain: 0.8, reps: [12, 16], sets: 3, step: 5 },
    ],
  },
  {
    label: "Upper",
    weekday: 4,
    movements: [
      { name: "Incline Barbell Bench Press", start: 57.5, gain: 0.9, reps: [6, 9], sets: 4, step: 2.5, warmups: 2 },
      { name: "Dumbbell Row", start: 32, gain: 0.45, reps: [8, 12], sets: 3, step: 2 },
      { name: "Seated Dumbbell Shoulder Press", start: 24, gain: 0.3, reps: [8, 12], sets: 3, step: 2 },
      { name: "Skull Crusher", start: 32.5, gain: 0.35, reps: [8, 12], sets: 3, step: 2.5 },
      { name: "Hammer Curl", start: 14, gain: 0.2, reps: [10, 14], sets: 3, step: 2 },
      { name: "Cable Crunch", start: 35, gain: 0.5, reps: [12, 15], sets: 3, step: 5 },
    ],
  },
];

const SESSION_NOTES = [
  "Felt strong today.",
  "Short on time, cut the last exercise.",
  "Sleep was bad, everything felt heavy.",
  "Deload week — kept it easy on purpose.",
  "Good session, bar speed was quick.",
  "Elbow a bit cranky, kept the reps higher.",
];

const ENTRY_NOTES = [
  "Left side lagging.",
  "Paused the last rep.",
  "Add 2.5 kg next week.",
  "Form broke down on the last set.",
  "Belt from the second set.",
];

/* ------------------------------------------------------------------- random */

/** mulberry32: small, fast, and seedable, which is the only property that matters here. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ shaping */

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Where a movement sits after `week` weeks of training.
 *
 * `week ** 0.8` rather than a straight line: a year of linear progress puts a
 * beginner's bench press somewhere absurd, and the flattening is what makes the
 * strength chart look like training instead of a ramp.
 */
function progressed(movement: Movement, week: number): number {
  return movement.start + movement.gain * Math.pow(week, 0.8);
}

type PlannedSet = { reps: number; weight: number; isWarmup: boolean };

/**
 * One exercise entry's worth of sets: warm-ups, a top set, then back-offs that
 * trade weight for reps the way real back-off sets do.
 */
function planSets(movement: Movement, week: number, deload: boolean, random: () => number): PlannedSet[] {
  const [hardest, easiest] = movement.reps;
  const mid = (hardest + easiest) / 2;
  const reps = hardest + Math.floor(random() * (easiest - hardest + 1));

  /**
   * Fewer reps means more weight, so the estimated one-rep max stays a property
   * of the lifter and not of whichever rep scheme the week happened to pick.
   */
  const base = progressed(movement, week) * (1 + (mid - reps) * 0.03);
  const noise = 1 + (random() - 0.5) * 0.03;
  const top = Math.max(movement.step, roundTo(base * noise * (deload ? 0.85 : 1), movement.step));

  const planned: PlannedSet[] = [];

  for (let i = 0; i < (movement.warmups ?? 0); i += 1) {
    const fraction = 0.45 + (0.3 * i) / Math.max(1, (movement.warmups ?? 1) - 1);
    planned.push({
      reps: Math.max(3, Math.round(reps + 5 - i * 2)),
      weight: Math.max(movement.step, roundTo(top * fraction, movement.step)),
      isWarmup: true,
    });
  }

  const working = Math.max(1, movement.sets - (deload ? 1 : 0));
  for (let i = 0; i < working; i += 1) {
    planned.push({
      reps: reps + i,
      weight: Math.max(movement.step, roundTo(top * (1 - i * 0.05), movement.step)),
      isWarmup: false,
    });
  }

  return planned;
}

/** Which days of week `week` actually happened, and whether it was a deload. */
function planWeek(week: number, weeks: number, random: () => number): { days: Day[]; deload: boolean } {
  /** Two weeks off somewhere in the year: illness, travel, life. */
  const missed = week === Math.floor(weeks * 0.4) || week === Math.floor(weeks * 0.72);
  if (missed) return { days: [], deload: false };

  const deload = week > 0 && week % 8 === 7;

  /** Consistency improves over the year — the first months skip a day more often. */
  const skipChance = deload ? 0.35 : 0.22 - 0.14 * (week / Math.max(1, weeks - 1));
  const days = PROGRAM.filter(() => random() > skipChance);

  return { days: days.length > 0 ? days : [PROGRAM[0]], deload };
}

/* -------------------------------------------------------------------- rows */

type Row = {
  session: typeof workoutSessions.$inferInsert;
  entries: (typeof sessionExercises.$inferInsert)[];
  sets: (typeof sets.$inferInsert)[];
};

function buildYear(
  userId: string,
  exerciseIds: Map<string, string>,
  weeks: number,
  now: Date,
  random: () => number,
): Row[] {
  const rows: Row[] = [];
  const thisWeek = startOfZonedWeek(now);

  for (let week = 0; week < weeks; week += 1) {
    const monday = shiftZonedWeeks(thisWeek, -(weeks - 1 - week));
    const { days, deload } = planWeek(week, weeks, random);

    for (const day of days) {
      const { year, month, day: date } = zonedDate(monday);
      const weekend = day.weekday >= 5;
      const hour = weekend ? 9 + Math.floor(random() * 2) : 17 + Math.floor(random() * 2);
      const startedAt = zonedInstant(year, month, date + day.weekday, hour, Math.floor(random() * 12) * 5);

      /** The current week is only as far along as today is. */
      if (startedAt.getTime() > now.getTime()) continue;

      const minutes = 55 + Math.floor(random() * 30) - (deload ? 12 : 0);
      const endedAt = new Date(startedAt.getTime() + minutes * 60_000);

      const sessionId = crypto.randomUUID();
      const row: Row = {
        session: {
          id: sessionId,
          userId,
          startedAt,
          endedAt: endedAt.getTime() > now.getTime() ? now : endedAt,
          notes: random() < 0.18 ? SESSION_NOTES[Math.floor(random() * SESSION_NOTES.length)] : null,
        },
        entries: [],
        sets: [],
      };

      /** The last exercise is the first thing dropped when a session runs short. */
      const movements = day.movements.slice(0, random() < 0.2 ? day.movements.length - 1 : day.movements.length);

      movements.forEach((movement, index) => {
        const exerciseId = exerciseIds.get(movement.name);
        if (!exerciseId) throw new Error(`Catalog is missing "${movement.name}" — run npm run db:seed first.`);

        const entryId = crypto.randomUUID();
        row.entries.push({
          id: entryId,
          workoutSessionId: sessionId,
          exerciseId,
          position: index + 1,
          notes: random() < 0.08 ? ENTRY_NOTES[Math.floor(random() * ENTRY_NOTES.length)] : null,
          createdAt: startedAt,
        });

        planSets(movement, week, deload, random).forEach((planned, position) => {
          row.sets.push({
            id: crypto.randomUUID(),
            sessionExerciseId: entryId,
            position: position + 1,
            reps: planned.reps,
            /** numeric(6,2) as a string, the way the driver hands it back. */
            weight: planned.weight.toFixed(2),
            isWarmup: planned.isWarmup,
            createdAt: startedAt,
          });
        });
      });

      rows.push(row);
    }
  }

  return rows;
}

/* --------------------------------------------------------------------- main */

type Options = { email: string | null; weeks: number; replace: boolean; seed: number };

function parseArgs(argv: string[]): Options {
  const options: Options = { email: null, weeks: 52, replace: false, seed: 20260819 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--replace") options.replace = true;
    else if (arg === "--email") options.email = argv[++i] ?? null;
    else if (arg === "--weeks") options.weeks = Number(argv[++i]);
    else if (arg === "--seed") options.seed = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.weeks) || options.weeks < 1 || options.weeks > 52) {
    throw new Error("--weeks must be a whole number from 1 to 52 (the progress screen reads at most a year).");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("DATABASE_URL_UNPOOLED is not set. Seeding uses the direct, non-pooled Neon string.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const db = drizzle(pool);

  try {
    const accounts = await db.select({ id: users.id, email: users.email }).from(users);
    if (accounts.length === 0) throw new Error("No users exist yet. Sign up at /sign-up first.");

    const account = options.email
      ? accounts.find((row) => row.email.toLowerCase() === options.email!.toLowerCase())
      : accounts.length === 1
        ? accounts[0]
        : undefined;

    if (!account) {
      throw new Error(
        options.email
          ? `No user with email ${options.email}.`
          : `Several accounts exist — pass --email <address>. Known: ${accounts.map((row) => row.email).join(", ")}`,
      );
    }

    const existing = await db.$count(workoutSessions, eq(workoutSessions.userId, account.id));
    if (existing > 0 && !options.replace) {
      throw new Error(
        `${account.email} already has ${existing} workout session(s). ` +
          `Pass --replace to DELETE that entire training log and seed a fresh year in its place.`,
      );
    }

    /** Global catalog plus this user's own, the same filter every catalog read uses. */
    const catalog = await db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(or(isNull(exercises.ownerId), eq(exercises.ownerId, account.id)));

    const exerciseIds = new Map(catalog.map((row) => [row.name, row.id]));
    const rows = buildYear(account.id, exerciseIds, options.weeks, new Date(), rng(options.seed));

    const allEntries = rows.flatMap((row) => row.entries);
    const allSets = rows.flatMap((row) => row.sets);

    await db.transaction(async (tx) => {
      if (existing > 0) {
        /** Foreign-key order: sets, then entries, then the sessions themselves. */
        const doomed = tx
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(eq(workoutSessions.userId, account.id));

        await tx.delete(sets).where(
          inArray(
            sets.sessionExerciseId,
            tx
              .select({ id: sessionExercises.id })
              .from(sessionExercises)
              .where(inArray(sessionExercises.workoutSessionId, doomed)),
          ),
        );
        await tx.delete(sessionExercises).where(inArray(sessionExercises.workoutSessionId, doomed));
        await tx.delete(workoutSessions).where(eq(workoutSessions.userId, account.id));
      }

      /**
       * Chunked because Postgres caps a statement at 65,535 bind parameters,
       * and a year of sets is well past that.
       */
      const insertAll = async <T>(values: T[], insert: (chunk: T[]) => Promise<unknown>, size: number) => {
        for (let i = 0; i < values.length; i += size) await insert(values.slice(i, i + size));
      };

      await insertAll(rows.map((row) => row.session), (chunk) => tx.insert(workoutSessions).values(chunk), 500);
      await insertAll(allEntries, (chunk) => tx.insert(sessionExercises).values(chunk), 500);
      await insertAll(allSets, (chunk) => tx.insert(sets).values(chunk), 1000);
    });

    const working = allSets.filter((set) => !set.isWarmup);
    const volume = working.reduce((total, set) => total + set.reps! * Number(set.weight), 0);

    console.log(
      `Seeded ${rows.length} workout sessions, ${allEntries.length} exercise entries and ${allSets.length} sets ` +
        `(${working.length} working) for ${account.email} across ${options.weeks} weeks — ` +
        `${Math.round(volume).toLocaleString()} kg of working volume.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
