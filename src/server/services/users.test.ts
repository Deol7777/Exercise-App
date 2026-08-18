/**
 * Registration and the credential check. The timing equalisation in
 * `verifyCredentials` is not asserted here — it is a property of the code path,
 * and a clock-based assertion would be flaky.
 */
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { exercises, sets, workoutSessions } from "../db/schema";
import { createCustomExercise } from "./exercises";
import { addExerciseEntry, logSet, startWorkoutSession } from "./training";
import {
  deleteAccount,
  getWeightUnit,
  registerUser,
  setWeightUnit,
  verifyCredentials,
} from "./users";

const password = "correct-horse-battery";

describe("registerUser", () => {
  it("creates an account and trims the name", async () => {
    const user = await registerUser({
      email: "new@example.test",
      password,
      name: "  Dana  ",
    });

    expect(user).toMatchObject({ email: "new@example.test", name: "Dana" });
    expect(user.id).toBeTruthy();
  });

  it("stores no name when one is not given", async () => {
    const user = await registerUser({ email: "anon@example.test", password });
    expect(user.name).toBeNull();
  });

  it("refuses an email that already exists, whatever its case", async () => {
    await registerUser({ email: "taken@example.test", password });

    await expect(registerUser({ email: "TAKEN@example.test", password })).rejects.toMatchObject({
      code: "conflict",
    });
  });


  it("survives two registrations racing for the same email", async () => {
    /** Both calls pass the existence check; the loser hits the unique index. */
    const results = await Promise.allSettled([
      registerUser({ email: "race@example.test", password }),
      registerUser({ email: "race@example.test", password }),
    ]);

    const rejected = results.filter((result) => result.status === "rejected");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "conflict" });
  });
});

describe("verifyCredentials", () => {
  it("returns the user for the right password", async () => {
    const created = await registerUser({ email: "known@example.test", password });

    const verified = await verifyCredentials({ email: "known@example.test", password });
    expect(verified?.id).toBe(created.id);
  });

  it("matches the email case-insensitively", async () => {
    await registerUser({ email: "casing@example.test", password });

    const verified = await verifyCredentials({ email: "CASING@example.test", password });
    expect(verified).not.toBeNull();
  });

  it("returns null for a wrong password and for an unknown email alike", async () => {
    await registerUser({ email: "someone@example.test", password });

    expect(await verifyCredentials({ email: "someone@example.test", password: "wrong" })).toBeNull();
    expect(await verifyCredentials({ email: "nobody@example.test", password })).toBeNull();
  });
});

describe("the display unit", () => {
  it("is kilograms until it is changed", async () => {
    const user = await registerUser({ email: "units@example.test", password });

    expect(await getWeightUnit(user.id)).toBe("kg");
  });

  it("changes, and stays changed", async () => {
    const user = await registerUser({ email: "pounds@example.test", password });

    expect(await setWeightUnit(user.id, "lb")).toBe("lb");
    expect(await getWeightUnit(user.id)).toBe("lb");
  });

  it("is not_found for an account that does not exist", async () => {
    await expect(getWeightUnit("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      setWeightUnit("00000000-0000-4000-8000-000000000000", "lb"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleting an account", () => {
  it("takes the workouts, sets and custom exercises with it", async () => {
    const user = await registerUser({ email: "leaving@example.test", password });

    const custom = await createCustomExercise(user.id, {
      name: "Zercher Squat",
      muscleGroup: "quads",
    });
    const session = await startWorkoutSession(user.id);
    const entry = await addExerciseEntry(user.id, session.id, { exerciseId: custom.id });
    await logSet(user.id, entry.id, { reps: 5, weight: 100 });

    await deleteAccount(user.id);

    /**
     * This is the case that used to fail outright: `exercises` cascades from
     * `users`, but `session_exercises.exercise_id` is `restrict`, so a user who
     * logged their own custom exercise could not be deleted at all.
     */
    const [{ count: sessionCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, user.id));
    const [{ count: customCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exercises)
      .where(eq(exercises.ownerId, user.id));
    const [{ count: setCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(sets);

    expect([sessionCount, customCount, setCount]).toEqual([0, 0, 0]);
    expect(await verifyCredentials({ email: "leaving@example.test", password })).toBeNull();
  });

  it("leaves the global catalog and other users alone", async () => {
    const leaving = await registerUser({ email: "gone@example.test", password });
    const staying = await registerUser({ email: "staying@example.test", password });

    await createCustomExercise(leaving.id, { name: "Zercher Squat", muscleGroup: "quads" });
    const kept = await createCustomExercise(staying.id, {
      name: "Jefferson Curl",
      muscleGroup: "back",
    });
    const session = await startWorkoutSession(staying.id);

    await deleteAccount(leaving.id);

    const [{ count: globalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(exercises)
      .where(sql`${exercises.ownerId} is null`);

    expect(globalCount).toBe(60);
    expect(await getWeightUnit(staying.id)).toBe("kg");
    expect((await db.select().from(exercises).where(eq(exercises.id, kept.id))).length).toBe(1);
    expect(
      (await db.select().from(workoutSessions).where(eq(workoutSessions.id, session.id))).length,
    ).toBe(1);
  });

  it("is not_found the second time", async () => {
    const user = await registerUser({ email: "twice@example.test", password });
    await deleteAccount(user.id);

    await expect(deleteAccount(user.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
