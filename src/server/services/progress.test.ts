/**
 * The read path. These are the tests that would have caught both bugs found by
 * hand: `numeric` arriving as a string, and `date_trunc` arriving as one too.
 */
import { describe, expect, it } from "vitest";

import { createUser, globalExercise } from "@/test/factories";

import { addExerciseEntry, finishWorkoutSession, logSet, startWorkoutSession } from "./training";
import { getLastPerformance, getPersonalRecords, getWeeklyVolume } from "./progress";

const DAY = 86_400_000;

/** A finished session, back-dated, holding one exercise and its sets. */
async function loggedSession(
  userId: string,
  exerciseName: string,
  sets: { reps: number; weight: number; isWarmup?: boolean }[],
  daysAgo = 0,
) {
  const session = await startWorkoutSession(userId, {
    startedAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  });
  const entry = await addExerciseEntry(userId, session.id, {
    exerciseId: await globalExercise(userId, exerciseName),
  });

  for (const set of sets) await logSet(userId, entry.id, set);
  await finishWorkoutSession(userId, session.id);

  return { session, entry };
}

describe("personal records", () => {
  it("takes the heaviest working set and ignores warm-ups", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [
      { reps: 10, weight: 200, isWarmup: true },
      { reps: 5, weight: 80 },
      { reps: 3, weight: 90 },
    ]);

    const [record] = await getPersonalRecords(userId);
    expect(record).toMatchObject({ exerciseName: "Barbell Bench Press", weight: 90, reps: 3 });
    expect(typeof record.weight).toBe("number");
  });

  it("breaks a tie on weight by reps", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [
      { reps: 3, weight: 140 },
      { reps: 5, weight: 140 },
    ]);

    const [record] = await getPersonalRecords(userId);
    expect(record).toMatchObject({ weight: 140, reps: 5 });
  });

  it("reports one record per exercise, by name", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 3);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }]);

    const records = await getPersonalRecords(userId);
    expect(records.map((record) => record.exerciseName)).toEqual([
      "Barbell Bench Press",
      "Deadlift",
    ]);
  });

  it("does not see another user's lifts", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await loggedSession(owner, "Deadlift", [{ reps: 5, weight: 200 }]);

    expect(await getPersonalRecords(stranger)).toEqual([]);
  });
});

describe("last performance", () => {
  it("returns the previous session, not the one in progress", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [
      { reps: 5, weight: 80 },
      { reps: 5, weight: 85 },
    ], 7);

    const current = await startWorkoutSession(userId);
    const exerciseId = await globalExercise(userId, "Barbell Bench Press");
    const entry = await addExerciseEntry(userId, current.id, { exerciseId });
    await logSet(userId, entry.id, { reps: 3, weight: 90 });

    const last = await getLastPerformance(userId, exerciseId, {
      excludeWorkoutSessionId: current.id,
    });

    expect(last?.sets.map((set) => set.weight)).toEqual([80, 85]);
  });

  it("includes warm-up sets, because it is a recall and not a statistic", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [
      { reps: 10, weight: 20, isWarmup: true },
      { reps: 5, weight: 100 },
    ]);

    const last = await getLastPerformance(userId, await globalExercise(userId, "Back Squat"));
    expect(last?.sets).toHaveLength(2);
  });

  it("is null for an exercise never performed", async () => {
    const userId = await createUser();
    const exerciseId = await globalExercise(userId, "Burpee");

    expect(await getLastPerformance(userId, exerciseId)).toBeNull();
  });

  it("throws not_found for an exercise the user cannot see", async () => {
    const userId = await createUser();

    await expect(
      getLastPerformance(userId, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("weekly volume", () => {
  it("returns weeks as Dates, newest first", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }], 14);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 3, weight: 90 }]);

    const points = await getWeeklyVolume(userId, 8);

    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const point of points) {
      expect(point.week).toBeInstanceOf(Date);
      expect(Number.isNaN(point.week.getTime())).toBe(false);
      expect(typeof point.volume).toBe("number");
    }
    expect(points[0].week.getTime()).toBeGreaterThan(points.at(-1)!.week.getTime());
  });

  it("sums reps × weight over working sets only", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [
      { reps: 10, weight: 500, isWarmup: true },
      { reps: 5, weight: 80 },
      { reps: 5, weight: 85 },
    ]);

    const [point] = await getWeeklyVolume(userId, 8);
    expect(point).toMatchObject({ muscleGroup: "chest", volume: 825, setCount: 2 });
  });

  it("splits by muscle group", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }]);
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }]);

    const points = await getWeeklyVolume(userId, 8);
    expect(points.map((point) => point.muscleGroup).sort()).toEqual(["chest", "quads"]);
  });

  it("excludes sessions older than the window", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 60);

    expect(await getWeeklyVolume(userId, 4)).toEqual([]);
  });
});
