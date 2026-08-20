/**
 * The read path. These are the tests that would have caught both bugs found by
 * hand: `numeric` arriving as a string, and `date_trunc` arriving as one too.
 */
import { describe, expect, it } from "vitest";

import { createUser, globalExercise } from "@/test/factories";

import {
  addExerciseEntry,
  editWorkoutSession,
  finishWorkoutSession,
  logSet,
  startWorkoutSession,
} from "./training";
import {
  getLastPerformance,
  getMonthOfHistory,
  getPersonalRecords,
  getWeeklyVolume,
} from "./progress";

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

describe("a month of history", () => {
  /**
   * Dates are pinned in UTC because that is the cut `findMonthOfSessions`
   * groups on. A test written with local dates passes in one timezone and
   * fails a cell either side of it in another.
   */
  const MONTH = { year: 2026, month: 3 };

  /** A session on a given day of March 2026, running for `minutes`. */
  async function marchSession(
    userId: string,
    day: number,
    { hour = 9, minutes }: { hour?: number; minutes: number | null },
  ) {
    const startedAt = new Date(Date.UTC(2026, 2, day, hour));
    const session = await startWorkoutSession(userId, { startedAt: startedAt.toISOString() });

    if (minutes !== null) {
      await editWorkoutSession(userId, session.id, {
        endedAt: new Date(startedAt.getTime() + minutes * 60_000).toISOString(),
      });
    }

    return session;
  }

  it("reports one row per trained day, with the counts", async () => {
    const userId = await createUser();
    await marchSession(userId, 3, { minutes: 45 });
    await marchSession(userId, 11, { minutes: 62 });

    const { days, workouts, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days.map((entry) => entry.day)).toEqual([3, 11]);
    expect(workouts).toBe(2);
    expect(minutes).toBe(107);
  });

  it("collapses two sessions on one day into one row, pointing at the first", async () => {
    const userId = await createUser();
    const morning = await marchSession(userId, 8, { hour: 7, minutes: 30 });
    await marchSession(userId, 8, { hour: 18, minutes: 40 });

    const { days, workouts, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: 8, sessionCount: 2, workoutSessionId: morning.id });
    expect(workouts).toBe(2);
    expect(minutes).toBe(70);
  });

  it("counts an unfinished session as a workout but adds no time", async () => {
    const userId = await createUser();
    await marchSession(userId, 5, { minutes: null });

    const { days, workouts, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days).toEqual([
      expect.objectContaining({ day: 5, sessionCount: 1, seconds: 0 }),
    ]);
    expect(workouts).toBe(1);
    expect(minutes).toBe(0);
  });

  it("excludes the months either side, to the boundary", async () => {
    const userId = await createUser();
    /** 23:00 on the last day of February and 00:00 on the 1st of April. */
    const february = await startWorkoutSession(userId, {
      startedAt: new Date(Date.UTC(2026, 1, 28, 23)).toISOString(),
    });
    await editWorkoutSession(userId, february.id, {
      endedAt: new Date(Date.UTC(2026, 1, 28, 24)).toISOString(),
    });
    await marchSession(userId, 1, { hour: 0, minutes: 20 });
    await marchSession(userId, 31, { hour: 23, minutes: 20 });
    const april = await startWorkoutSession(userId, {
      startedAt: new Date(Date.UTC(2026, 3, 1)).toISOString(),
    });
    await editWorkoutSession(userId, april.id, {
      endedAt: new Date(Date.UTC(2026, 3, 1, 1)).toISOString(),
    });

    const { days, workouts, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days.map((entry) => entry.day)).toEqual([1, 31]);
    expect(workouts).toBe(2);
    expect(minutes).toBe(40);
  });

  it("keeps one user's month away from another's", async () => {
    const mine = await createUser();
    const theirs = await createUser();
    await marchSession(theirs, 12, { minutes: 90 });

    expect(await getMonthOfHistory(mine, MONTH)).toEqual({ days: [], workouts: 0, minutes: 0 });
  });

  it("returns numbers, not the strings the driver hands back", async () => {
    const userId = await createUser();
    await marchSession(userId, 17, { minutes: 55 });

    const [day] = (await getMonthOfHistory(userId, MONTH)).days;
    expect(typeof day.day).toBe("number");
    expect(typeof day.sessionCount).toBe("number");
    expect(typeof day.seconds).toBe("number");
  });
});
