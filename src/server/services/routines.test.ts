/**
 * Routine rules, against a real Postgres: the ownership scoping every routine
 * query depends on, the one-name-per-user constraint, and the ordering that
 * makes a routine a *list* of exercises rather than a bag of them.
 */
import { describe, expect, it } from "vitest";

import { createUser, globalExercise } from "@/test/factories";

import { DomainError } from "../errors";
import { createCustomExercise } from "./exercises";
import {
  addRoutineExercise,
  createRoutine,
  editRoutine,
  getRoutine,
  listRoutinesFor,
  removeRoutine,
  removeRoutineExercise,
  reorderRoutineExercises,
} from "./routines";

/** Every domain failure is asserted by code, not message, so wording can change freely. */
async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "no error";
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

/** A routine holding `names`, in that order. */
async function routineOf(userId: string, name: string, names: string[]) {
  const routine = await createRoutine(userId, { name });
  for (const exercise of names) {
    await addRoutineExercise(userId, routine.id, {
      exerciseId: await globalExercise(userId, exercise),
    });
  }
  return routine;
}

describe("keeping routines", () => {
  it("creates one, lists it, and counts what is in it", async () => {
    const userId = await createUser();
    await routineOf(userId, "Push Day", ["Barbell Bench Press", "Dip"]);

    const list = await listRoutinesFor(userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Push Day", exerciseCount: 2 });
  });

  it("lists routines alphabetically, so the row you reached for has not moved", async () => {
    const userId = await createUser();
    await createRoutine(userId, { name: "Pull Day" });
    await createRoutine(userId, { name: "Legs" });
    await createRoutine(userId, { name: "Push Day" });

    const list = await listRoutinesFor(userId);
    expect(list.map((routine) => routine.name)).toEqual(["Legs", "Pull Day", "Push Day"]);
  });

  it("counts an empty routine as zero rather than dropping it from the list", async () => {
    const userId = await createUser();
    await createRoutine(userId, { name: "Someday" });

    expect(await listRoutinesFor(userId)).toMatchObject([{ name: "Someday", exerciseCount: 0 }]);
  });

  it("refuses two routines with the same name for one user, and allows it across users", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    await createRoutine(owner, { name: "Push Day" });

    expect(await codeOf(() => createRoutine(owner, { name: "Push Day" }))).toBe("conflict");
    await expect(createRoutine(stranger, { name: "Push Day" })).resolves.toMatchObject({
      name: "Push Day",
    });
  });

  it("renames one, and refuses a rename onto a name already taken", async () => {
    const userId = await createUser();
    const routine = await createRoutine(userId, { name: "Push Day" });
    await createRoutine(userId, { name: "Pull Day" });

    await expect(editRoutine(userId, routine.id, { name: "Chest Day" })).resolves.toMatchObject({
      name: "Chest Day",
    });
    expect(await codeOf(() => editRoutine(userId, routine.id, { name: "Pull Day" }))).toBe(
      "conflict",
    );
  });

  it("deletes a routine and the exercises in it", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", ["Barbell Bench Press"]);

    await removeRoutine(userId, routine.id);

    expect(await listRoutinesFor(userId)).toEqual([]);
    expect(await codeOf(() => getRoutine(userId, routine.id))).toBe("not_found");
  });
});

describe("one user's routines stay away from another", () => {
  it("hides a stranger's routine behind not_found on every operation", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const routine = await routineOf(owner, "Push Day", ["Barbell Bench Press"]);

    expect(await listRoutinesFor(stranger)).toEqual([]);
    expect(await codeOf(() => getRoutine(stranger, routine.id))).toBe("not_found");
    expect(await codeOf(() => editRoutine(stranger, routine.id, { name: "Mine" }))).toBe(
      "not_found",
    );
    expect(await codeOf(() => removeRoutine(stranger, routine.id))).toBe("not_found");
    const dip = await globalExercise(stranger, "Dip");
    expect(
      await codeOf(() => addRoutineExercise(stranger, routine.id, { exerciseId: dip })),
    ).toBe("not_found");

    /** Still intact after all of that. */
    await expect(getRoutine(owner, routine.id)).resolves.toMatchObject({ name: "Push Day" });
  });

  it("refuses to put a stranger's custom exercise in a routine", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const secret = await createCustomExercise(stranger, {
      name: "Jefferson Curl",
      muscleGroup: "back",
    });
    const routine = await createRoutine(owner, { name: "Push Day" });

    expect(
      await codeOf(() => addRoutineExercise(owner, routine.id, { exerciseId: secret.id })),
    ).toBe("not_found");
  });
});

describe("the order of a routine", () => {
  it("appends each exercise at the end, 1..n", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", [
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);

    const detail = await getRoutine(userId, routine.id);
    expect(detail.exercises.map((line) => line.position)).toEqual([1, 2, 3]);
    expect(detail.exercises.map((line) => line.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);
  });

  it("rewrites the order, and rejects a list that is not every exercise exactly once", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", [
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);
    const [first, second, third] = (await getRoutine(userId, routine.id)).exercises;

    await reorderRoutineExercises(userId, routine.id, [third.id, first.id, second.id]);

    const reordered = await getRoutine(userId, routine.id);
    expect(reordered.exercises.map((line) => line.exercise.name)).toEqual([
      "Dip",
      "Barbell Bench Press",
      "Overhead Press",
    ]);
    expect(reordered.exercises.map((line) => line.position)).toEqual([1, 2, 3]);

    /** A partial list would otherwise mean "move this one" and "delete the rest" at once. */
    expect(await codeOf(() => reorderRoutineExercises(userId, routine.id, [first.id]))).toBe(
      "invalid",
    );
    expect(
      await codeOf(() =>
        reorderRoutineExercises(userId, routine.id, [first.id, first.id, second.id]),
      ),
    ).toBe("invalid");
  });

  it("closes the gap a removal leaves behind on the next reorder", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", [
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);
    const [first, second, third] = (await getRoutine(userId, routine.id)).exercises;

    await removeRoutineExercise(userId, second.id);
    expect((await getRoutine(userId, routine.id)).exercises.map((line) => line.position)).toEqual([
      1, 3,
    ]);

    await reorderRoutineExercises(userId, routine.id, [third.id, first.id]);
    expect((await getRoutine(userId, routine.id)).exercises.map((line) => line.position)).toEqual([
      1, 2,
    ]);
  });

  it("keeps appending correctly after a removal", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", ["Barbell Bench Press", "Overhead Press"]);
    const [, second] = (await getRoutine(userId, routine.id)).exercises;

    await removeRoutineExercise(userId, second.id);
    await addRoutineExercise(userId, routine.id, {
      exerciseId: await globalExercise(userId, "Dip"),
    });

    const detail = await getRoutine(userId, routine.id);
    expect(detail.exercises.map((line) => line.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Dip",
    ]);
  });

  it("hides a stranger's routine exercise behind not_found", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const routine = await routineOf(owner, "Push Day", ["Barbell Bench Press"]);
    const [line] = (await getRoutine(owner, routine.id)).exercises;

    expect(await codeOf(() => removeRoutineExercise(stranger, line.id))).toBe("not_found");
  });
});
