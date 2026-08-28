/**
 * The read path. These are the tests that would have caught both bugs found by
 * hand: `numeric` arriving as a string, and `date_trunc` arriving as one too.
 */
import { describe, expect, it } from "vitest";

import { zonedInstant } from "@/lib/time-zone";
import { createUser, globalExercise } from "@/test/factories";

import {
  addExerciseEntry,
  editWorkoutSession,
  finishWorkoutSession,
  logSet,
  startWorkoutSession,
} from "./training";
import {
  getExerciseVolume,
  getLastPerformance,
  getLastTopSet,
  getLoggedExercises,
  getMonthOfHistory,
  getPersonalRecords,
  getRecentRecords,
  getStrengthProgress,
  getVolumeSummary,
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
  it("returns buckets as Dates, oldest first", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }], 14);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 3, weight: 90 }]);

    const points = await getWeeklyVolume(userId, 8);

    expect(points.length).toBeGreaterThanOrEqual(2);
    for (const point of points) {
      expect(point.bucket).toBeInstanceOf(Date);
      expect(Number.isNaN(point.bucket.getTime())).toBe(false);
      expect(typeof point.volume).toBe("number");
    }
    expect(points[0].bucket.getTime()).toBeLessThan(points.at(-1)!.bucket.getTime());
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
   * Every instant here is named as a *Pacific wall clock* time through
   * `zonedInstant`, because that is the cut `findMonthOfSessions` groups on.
   * Written with `Date.UTC` these would pass and mean nothing: 1 March 00:00
   * UTC is still 28 February in Pacific, so the assertion would be about a
   * different month than the one it names.
   */
  const MONTH = { year: 2026, month: 3 };

  /** A session on a given day of March 2026, running for `minutes`. */
  async function marchSession(
    userId: string,
    day: number,
    { hour = 9, minutes }: { hour?: number; minutes: number | null },
  ) {
    const startedAt = zonedInstant(2026, 3, day, hour);
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
    /** 23:00 Pacific on the last day of February, and 00:00 Pacific on 1 April. */
    const february = await startWorkoutSession(userId, {
      startedAt: zonedInstant(2026, 2, 28, 23).toISOString(),
    });
    await editWorkoutSession(userId, february.id, {
      endedAt: zonedInstant(2026, 3, 1, 0).toISOString(),
    });
    await marchSession(userId, 1, { hour: 0, minutes: 20 });
    await marchSession(userId, 31, { hour: 23, minutes: 20 });
    const april = await startWorkoutSession(userId, {
      startedAt: zonedInstant(2026, 4, 1).toISOString(),
    });
    await editWorkoutSession(userId, april.id, {
      endedAt: zonedInstant(2026, 4, 1, 1).toISOString(),
    });

    const { days, workouts, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days.map((entry) => entry.day)).toEqual([1, 31]);
    expect(workouts).toBe(2);
    expect(minutes).toBe(40);
  });

  /**
   * The case that made the zone worth having. Under a UTC cut, a Saturday
   * evening session in California is already Sunday — the wrong cell, and for a
   * late enough workout on the 31st, the wrong month.
   */
  it("keeps a late-evening Pacific session on the day it was trained", async () => {
    const userId = await createUser();
    await marchSession(userId, 14, { hour: 23, minutes: 40 });
    const spilling = await startWorkoutSession(userId, {
      startedAt: zonedInstant(2026, 3, 31, 22).toISOString(),
    });
    await editWorkoutSession(userId, spilling.id, {
      endedAt: zonedInstant(2026, 3, 31, 23).toISOString(),
    });

    const { days } = await getMonthOfHistory(userId, MONTH);

    /** Both are past midnight UTC, and neither has moved. */
    expect(days.map((entry) => entry.day)).toEqual([14, 31]);
  });

  /**
   * 8 March 2026 is the spring-forward: Pacific loses 02:00–03:00, so that day
   * is 23 hours long. The grid still has to show one cell for it.
   */
  it("holds the day together across a daylight-saving change", async () => {
    const userId = await createUser();
    await marchSession(userId, 8, { hour: 1, minutes: 30 });
    await marchSession(userId, 8, { hour: 20, minutes: 30 });

    const { days, minutes } = await getMonthOfHistory(userId, MONTH);

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ day: 8, sessionCount: 2 });
    expect(minutes).toBe(60);
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

describe("the exercises worth picking from", () => {
  it("offers only what has a working set, most recently trained first", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 10);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }], 2);
    /** Warmed up and never worked: nothing to plot, so nothing to pick. */
    await loggedSession(userId, "Back Squat", [{ reps: 10, weight: 20, isWarmup: true }], 1);

    const logged = await getLoggedExercises(userId);

    expect(logged.map((exercise) => exercise.name)).toEqual([
      "Barbell Bench Press",
      "Deadlift",
    ]);
    expect(logged[0].lastPerformedAt).toBeInstanceOf(Date);
  });

  it("counts workouts, not sets", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [
      { reps: 5, weight: 140 },
      { reps: 5, weight: 145 },
    ], 7);
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 150 }], 1);

    const [deadlift] = await getLoggedExercises(userId);
    expect(deadlift.sessionCount).toBe(2);
  });

  /**
   * The dropdowns look back a year whatever the charts are set to, so narrowing
   * to one week cannot empty the list of lifts you can narrow it to.
   */
  it("keeps offering a lift trained months ago, whatever the charts show", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 200);

    expect((await getLoggedExercises(userId)).map((exercise) => exercise.name)).toEqual([
      "Deadlift",
    ]);
  });

  it("drops one last trained over a year ago", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 400);

    expect(await getLoggedExercises(userId)).toEqual([]);
  });

  it("does not offer another user's lifts", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await loggedSession(owner, "Deadlift", [{ reps: 5, weight: 200 }]);

    expect(await getLoggedExercises(stranger)).toEqual([]);
  });
});

describe("strength over time", () => {
  it("gives one point per day trained, oldest first", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [
      { reps: 5, weight: 100 },
      { reps: 5, weight: 105 },
    ], 14);
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 110 }], 7);

    const exerciseId = await globalExercise(userId, "Back Squat");
    const { points } = await getStrengthProgress(userId, exerciseId, "month");

    expect(points).toHaveLength(2);
    expect(points[0].day.getTime()).toBeLessThan(points[1].day.getTime());
    expect(points[0]).toMatchObject({ weight: 105, reps: 5, setCount: 2, volume: 1025 });
  });

  /**
   * The point is the heaviest bar of the day and nothing else — no estimate is
   * made from the reps. A set of twelve that was the heaviest thing lifted is
   * the point for that day.
   */
  it("plots the heaviest weight, whatever it was done for", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Barbell Bench Press", [
      { reps: 5, weight: 100 },
      { reps: 12, weight: 105 },
    ]);

    const exerciseId = await globalExercise(userId, "Barbell Bench Press");
    const [point] = (await getStrengthProgress(userId, exerciseId, "month")).points;

    expect(point).toMatchObject({ weight: 105, reps: 12 });
  });

  it("breaks a tie on weight by reps", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [
      { reps: 3, weight: 120 },
      { reps: 6, weight: 120 },
    ]);

    const exerciseId = await globalExercise(userId, "Back Squat");
    const [point] = (await getStrengthProgress(userId, exerciseId, "month")).points;

    expect(point).toMatchObject({ weight: 120, reps: 6 });
  });

  it("collapses two workouts on the same day into one point", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 1);
    await loggedSession(userId, "Deadlift", [{ reps: 3, weight: 150 }], 1);

    const exerciseId = await globalExercise(userId, "Deadlift");
    const { points } = await getStrengthProgress(userId, exerciseId, "month");

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ weight: 150, setCount: 2 });
  });

  it("ignores warm-ups, however heavy they were mistyped as", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [
      { reps: 1, weight: 400, isWarmup: true },
      { reps: 5, weight: 140 },
    ]);

    const exerciseId = await globalExercise(userId, "Deadlift");
    const { points } = await getStrengthProgress(userId, exerciseId, "month");

    expect(points).toHaveLength(1);
    expect(points[0].weight).toBe(140);
  });

  it("reports the change across the range, and nothing from one day", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 21);
    const exerciseId = await globalExercise(userId, "Back Squat");

    expect((await getStrengthProgress(userId, exerciseId, "month")).change).toBeNull();

    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 110 }], 1);

    const { change, best, latest } = await getStrengthProgress(userId, exerciseId, "month");
    expect(change).toBe(10);
    expect(best?.weight).toBe(110);
    expect(latest?.weight).toBe(110);
  });

  it("narrows to the range asked for", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 20);
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 150 }], 2);

    const exerciseId = await globalExercise(userId, "Deadlift");

    expect((await getStrengthProgress(userId, exerciseId, "week")).points).toHaveLength(1);
    expect((await getStrengthProgress(userId, exerciseId, "month")).points).toHaveLength(2);
    expect((await getStrengthProgress(userId, exerciseId, "year")).points).toHaveLength(2);
  });

  it("is empty, not broken, for an exercise never performed", async () => {
    const userId = await createUser();
    const exerciseId = await globalExercise(userId, "Burpee");

    expect(await getStrengthProgress(userId, exerciseId, "month")).toMatchObject({
      points: [],
      best: null,
      latest: null,
      change: null,
    });
  });

  it("throws not_found for an exercise the user cannot see", async () => {
    const userId = await createUser();

    await expect(
      getStrengthProgress(userId, "00000000-0000-4000-8000-000000000000", "month"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not plot another user's sets", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await loggedSession(owner, "Deadlift", [{ reps: 5, weight: 200 }]);

    const exerciseId = await globalExercise(stranger, "Deadlift");
    expect((await getStrengthProgress(stranger, exerciseId, "month")).points).toEqual([]);
  });
});

describe("records, most recent first", () => {
  it("orders by when the record was set and caps the list", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 20);
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 10);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }], 1);

    const records = await getRecentRecords(userId);
    expect(records.map((record) => record.exerciseName)).toEqual([
      "Barbell Bench Press",
      "Back Squat",
      "Deadlift",
    ]);

    expect(await getRecentRecords(userId, { limit: 2 })).toHaveLength(2);
  });

  /** The same week boundary the home screen counts its PRs on. */
  it("badges a record set this week and not one from a month ago", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 30);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }]);

    const records = await getRecentRecords(userId);
    expect(records.find((record) => record.exerciseName === "Barbell Bench Press")?.isNew).toBe(true);
    expect(records.find((record) => record.exerciseName === "Deadlift")?.isNew).toBe(false);
  });
});

describe("the volume summary", () => {
  it("returns a bucket per day of the last 30, oldest first, empty ones included", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 21);

    const summary = await getVolumeSummary(userId, "month");

    expect(summary.buckets).toHaveLength(30);
    expect(summary.buckets.filter((bucket) => bucket.volume > 0)).toHaveLength(1);
    expect(summary.trained).toBe(1);
    for (let index = 1; index < summary.buckets.length; index += 1) {
      expect(summary.buckets[index].bucket.getTime()).toBeGreaterThan(
        summary.buckets[index - 1].bucket.getTime(),
      );
    }
  });

  it("cuts a week into 7 days and a year into 12 months", async () => {
    const userId = await createUser();

    expect((await getVolumeSummary(userId, "week")).buckets).toHaveLength(7);
    expect((await getVolumeSummary(userId, "year")).buckets).toHaveLength(12);
  });

  /**
   * The assertion the zero-filling rests on. The series is built in JavaScript
   * from `bucketStart`; the volume is grouped by `date_trunc` in Postgres. If
   * the two ever cut a bucket differently the totals do not throw — they land in
   * a bucket the series does not contain, and every bar reads zero.
   */
  it("puts today's work in today's bucket", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }]);

    const summary = await getVolumeSummary(userId, "month");
    const today = summary.buckets[summary.buckets.length - 1];

    expect(today.volume).toBe(500);
    expect(today.setCount).toBe(1);
    expect(summary.total).toBe(500);
    expect(summary.setCount).toBe(1);
  });

  it("finds the same total however the range is cut", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 3);
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 1);

    expect((await getVolumeSummary(userId, "week")).total).toBe(1200);
    expect((await getVolumeSummary(userId, "month")).total).toBe(1200);
    expect((await getVolumeSummary(userId, "year")).total).toBe(1200);
  });

  it("excludes what falls before the range", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 20);

    expect((await getVolumeSummary(userId, "week")).total).toBe(0);
    expect((await getVolumeSummary(userId, "month")).total).toBe(700);
  });

  it("splits the range by muscle group, heaviest first, as shares of one", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 3);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }], 2);

    const { byMuscleGroup, total } = await getVolumeSummary(userId, "month");

    expect(byMuscleGroup.map((group) => group.muscleGroup)).toEqual(["quads", "chest"]);
    expect(total).toBe(900);
    expect(byMuscleGroup[0].share).toBeCloseTo(500 / 900, 6);
    expect(byMuscleGroup.reduce((sum, group) => sum + group.share, 0)).toBeCloseTo(1, 6);
  });

  it("is a full series of zeroes for a user who has logged nothing", async () => {
    const userId = await createUser();

    const summary = await getVolumeSummary(userId, "month");

    expect(summary.buckets).toHaveLength(30);
    expect(summary.total).toBe(0);
    expect(summary.trained).toBe(0);
    expect(summary.byMuscleGroup).toEqual([]);
  });
});

describe("the top set of the last session", () => {
  it("is the heaviest working set of the most recent workout, and how many stayed on it", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 120 }], 9);
    await loggedSession(
      userId,
      "Back Squat",
      [
        { reps: 5, weight: 100 },
        { reps: 5, weight: 100 },
        { reps: 3, weight: 100 },
        { reps: 8, weight: 80 },
      ],
      1,
    );

    const exerciseId = await globalExercise(userId, "Back Squat");
    const top = await getLastTopSet(userId, exerciseId);

    /** 120 was heavier, and was a different workout — this card is not a record. */
    expect(top).toMatchObject({ weight: 100, setCount: 3, reps: [5, 5, 3], totalSets: 4 });
  });

  it("ignores warm-ups, however heavy they were logged", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [
      { reps: 10, weight: 200, isWarmup: true },
      { reps: 5, weight: 140 },
    ]);

    const exerciseId = await globalExercise(userId, "Deadlift");
    expect(await getLastTopSet(userId, exerciseId)).toMatchObject({
      weight: 140,
      setCount: 1,
      totalSets: 1,
    });
  });

  /**
   * The same lift twice in one workout is two entries and one session, so both
   * belong to the same answer — the alternative counts half the sets.
   */
  it("gathers both entries when the lift was done twice in one workout", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId, {});
    const exerciseId = await globalExercise(userId, "Barbell Bench Press");

    const first = await addExerciseEntry(userId, session.id, { exerciseId });
    await logSet(userId, first.id, { reps: 5, weight: 80 });
    const second = await addExerciseEntry(userId, session.id, { exerciseId });
    await logSet(userId, second.id, { reps: 4, weight: 80 });
    await finishWorkoutSession(userId, session.id);

    expect(await getLastTopSet(userId, exerciseId)).toMatchObject({
      weight: 80,
      setCount: 2,
      reps: [5, 4],
      totalSets: 2,
    });
  });

  /** The strength card's window is a range; this one is "whenever it was". */
  it("reaches past the ranges the charts are bounded by", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Overhead Press", [{ reps: 5, weight: 45 }], 300);

    const exerciseId = await globalExercise(userId, "Overhead Press");
    expect(await getLastTopSet(userId, exerciseId)).toMatchObject({ weight: 45 });
  });

  it("is null for a lift that has only ever been warmed up", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Lateral Raise", [{ reps: 15, weight: 8, isWarmup: true }]);

    const exerciseId = await globalExercise(userId, "Lateral Raise");
    expect(await getLastTopSet(userId, exerciseId)).toBeNull();
  });

  it("throws not_found for an exercise the user cannot see", async () => {
    const userId = await createUser();

    await expect(
      getLastTopSet(userId, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not see another user's workout", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await loggedSession(owner, "Deadlift", [{ reps: 5, weight: 200 }]);

    expect(await getLastTopSet(stranger, await globalExercise(stranger, "Deadlift"))).toBeNull();
  });
});

describe("one exercise's volume", () => {
  it("is the same shape as the whole series, for that lift alone", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }]);
    await loggedSession(userId, "Barbell Bench Press", [{ reps: 5, weight: 80 }]);

    const squatId = await globalExercise(userId, "Back Squat");
    const squat = await getExerciseVolume(userId, squatId, "month");

    expect(squat.buckets).toHaveLength(30);
    expect(squat.total).toBe(500);
    expect(squat.setCount).toBe(1);

    /** The unfiltered card still sees both. */
    expect((await getVolumeSummary(userId, "month")).total).toBe(900);
  });

  it("buckets by day, and zero-fills the ones with nothing in them", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 140 }], 14);
    await loggedSession(userId, "Deadlift", [{ reps: 5, weight: 150 }], 1);

    const exerciseId = await globalExercise(userId, "Deadlift");
    const { buckets, total, trained } = await getExerciseVolume(userId, exerciseId, "month");

    expect(buckets).toHaveLength(30);
    expect(trained).toBe(2);
    expect(total).toBe(1450);
  });

  it("ignores warm-ups, the same as every other statistic", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [
      { reps: 10, weight: 20, isWarmup: true },
      { reps: 5, weight: 100 },
    ]);

    const exerciseId = await globalExercise(userId, "Back Squat");
    const { total, setCount } = await getExerciseVolume(userId, exerciseId, "month");

    expect(total).toBe(500);
    expect(setCount).toBe(1);
  });

  /**
   * One series is bucketed in JavaScript from raw sets and the other is grouped
   * by `date_trunc` in Postgres. Identical output is what says the two cut a
   * bucket at the same instant — at all three granularities.
   */
  it("agrees with the unfiltered series when only one lift was trained", async () => {
    const userId = await createUser();
    await loggedSession(userId, "Back Squat", [{ reps: 5, weight: 100 }], 8);
    await loggedSession(userId, "Back Squat", [{ reps: 3, weight: 110 }], 1);

    const exerciseId = await globalExercise(userId, "Back Squat");

    for (const range of ["week", "month", "year"] as const) {
      const one = await getExerciseVolume(userId, exerciseId, range);
      const all = await getVolumeSummary(userId, range);
      expect(one.buckets).toEqual(all.buckets);
      expect(one.total).toBe(all.total);
    }
  });

  it("is a full series of zeroes for a lift never performed", async () => {
    const userId = await createUser();
    const exerciseId = await globalExercise(userId, "Burpee");

    const { buckets, total } = await getExerciseVolume(userId, exerciseId, "month");
    expect(buckets).toHaveLength(30);
    expect(total).toBe(0);
  });

  it("throws not_found for an exercise the user cannot see", async () => {
    const userId = await createUser();

    await expect(
      getExerciseVolume(userId, "00000000-0000-4000-8000-000000000000", "month"),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("does not count another user's sets", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await loggedSession(owner, "Deadlift", [{ reps: 5, weight: 200 }]);

    const exerciseId = await globalExercise(stranger, "Deadlift");
    expect((await getExerciseVolume(stranger, exerciseId, "month")).total).toBe(0);
  });
});
