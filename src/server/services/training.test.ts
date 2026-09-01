/**
 * The write path's rules, against a real Postgres: ordering, the one-open-session
 * rule, and the ownership scoping that every training query depends on.
 */
import { describe, expect, it } from "vitest";

import { createUser, globalExercise } from "@/testing/factories";

import { DomainError } from "@/server/errors";
import { findPrebuiltRoutine } from "@/lib/prebuilt-routines";

import {
  addRoutineExercise,
  createRoutine,
  getRoutine,
  listRoutinesFor,
  removeRoutineExercise,
} from "./routines";
import {
  addExerciseEntry,
  editSet,
  reorderExerciseEntries,
  editWorkoutSession,
  finishWorkoutSession,
  getActiveWorkoutSession,
  getWorkoutSession,
  logSet,
  removeExerciseEntry,
  removeSet,
  removeWorkoutSession,
  startWorkoutSession,
  startWorkoutSessionFromPrebuiltRoutine,
  startWorkoutSessionFromRoutine,
} from "./training";

/** Every domain failure is asserted by code, not message, so wording can change freely. */
async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return "no error";
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe("workout session lifecycle", () => {
  it("starts one, and refuses a second while it is open", async () => {
    const userId = await createUser();

    const session = await startWorkoutSession(userId);
    expect(session.endedAt).toBeNull();
    expect(await getActiveWorkoutSession(userId)).toMatchObject({ id: session.id });

    expect(await codeOf(() => startWorkoutSession(userId))).toBe("conflict");
  });

  it("lets a second session start once the first is finished", async () => {
    const userId = await createUser();
    const first = await startWorkoutSession(userId);

    const finished = await finishWorkoutSession(userId, first.id);
    expect(finished.endedAt).toBeInstanceOf(Date);

    const second = await startWorkoutSession(userId);
    expect(second.id).not.toBe(first.id);
  });

  it("refuses to reopen a session while another is in progress", async () => {
    const userId = await createUser();
    const first = await startWorkoutSession(userId);
    await finishWorkoutSession(userId, first.id);
    await startWorkoutSession(userId);

    expect(await codeOf(() => editWorkoutSession(userId, first.id, { endedAt: null }))).toBe(
      "conflict",
    );
  });

  it("reopens a finished session when nothing else is open", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    await finishWorkoutSession(userId, session.id);

    const reopened = await editWorkoutSession(userId, session.id, { endedAt: null });
    expect(reopened.endedAt).toBeNull();
  });

  it("rejects an end time before the start", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);

    const before = new Date(session.startedAt.getTime() - 60_000).toISOString();
    expect(await codeOf(() => editWorkoutSession(userId, session.id, { endedAt: before }))).toBe(
      "invalid",
    );
  });

  it("rejects a start time in the future", async () => {
    const userId = await createUser();
    const later = new Date(Date.now() + 3_600_000).toISOString();

    expect(await codeOf(() => startWorkoutSession(userId, { startedAt: later }))).toBe("invalid");
  });

  it("still accepts sets after the session has ended", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Deadlift"),
    });
    await finishWorkoutSession(userId, session.id);

    const set = await logSet(userId, entry.id, { reps: 5, weight: 100 });
    expect(set.position).toBe(1);
  });
});

describe("ordering", () => {
  it("numbers exercise entries and sets from one, in the order they arrive", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);

    const first = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Barbell Bench Press"),
    });
    const second = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Barbell Row"),
    });

    expect([first.position, second.position]).toEqual([1, 2]);

    const positions = [];
    for (const reps of [5, 5, 3]) {
      positions.push((await logSet(userId, first.id, { reps, weight: 60 })).position);
    }
    expect(positions).toEqual([1, 2, 3]);
  });

  it("leaves a gap rather than renumbering when a set is deleted", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Pull-Up"),
    });

    const one = await logSet(userId, entry.id, { reps: 8, weight: 0 });
    const two = await logSet(userId, entry.id, { reps: 7, weight: 0 });
    await logSet(userId, entry.id, { reps: 6, weight: 0 });
    await removeSet(userId, two.id);

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises[0].sets.map((set) => set.position)).toEqual([1, 3]);
    expect(detail.exercises[0].sets[0].id).toBe(one.id);
  });

  it("continues numbering after the gap", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Dip"),
    });

    await logSet(userId, entry.id, { reps: 8, weight: 0 });
    const second = await logSet(userId, entry.id, { reps: 8, weight: 0 });
    await removeSet(userId, second.id);

    const next = await logSet(userId, entry.id, { reps: 8, weight: 0 });
    expect(next.position).toBe(2);
  });
});

describe("reordering exercise entries", () => {
  /** Three entries, in the order they were added. */
  async function sessionWithThree(userId: string) {
    const session = await startWorkoutSession(userId);
    const entries = [];
    for (const name of ["Barbell Bench Press", "Barbell Row", "Back Squat"]) {
      entries.push(
        await addExerciseEntry(userId, session.id, {
          exerciseId: await globalExercise(userId, name),
        }),
      );
    }
    return { session, entries };
  }

  const namesInOrder = async (userId: string, sessionId: string) =>
    (await getWorkoutSession(userId, sessionId)).exercises.map((entry) => entry.exercise.name);

  it("rewrites the running order", async () => {
    const userId = await createUser();
    const { session, entries } = await sessionWithThree(userId);

    const result = await reorderExerciseEntries(userId, session.id, [
      entries[2].id,
      entries[0].id,
      entries[1].id,
    ]);

    expect(result.map((row) => row.position)).toEqual([1, 2, 3]);
    expect(await namesInOrder(userId, session.id)).toEqual([
      "Back Squat",
      "Barbell Bench Press",
      "Barbell Row",
    ]);
  });

  it("survives a swap that would collide with a position still in use", async () => {
    const userId = await createUser();
    const { session, entries } = await sessionWithThree(userId);

    /** 1 <-> 2 is the case a naive per-row update breaks on. */
    await reorderExerciseEntries(userId, session.id, [
      entries[1].id,
      entries[0].id,
      entries[2].id,
    ]);

    expect(await namesInOrder(userId, session.id)).toEqual([
      "Barbell Row",
      "Barbell Bench Press",
      "Back Squat",
    ]);
  });

  it("closes gaps left by a deletion", async () => {
    const userId = await createUser();
    const { session, entries } = await sessionWithThree(userId);
    await removeExerciseEntry(userId, entries[1].id);

    const before = await getWorkoutSession(userId, session.id);
    expect(before.exercises.map((entry) => entry.position)).toEqual([1, 3]);

    await reorderExerciseEntries(userId, session.id, [entries[0].id, entries[2].id]);

    const after = await getWorkoutSession(userId, session.id);
    expect(after.exercises.map((entry) => entry.position)).toEqual([1, 2]);
  });

  it("rejects a list that is not exactly the session's entries", async () => {
    const userId = await createUser();
    const { session, entries } = await sessionWithThree(userId);

    /** Too few. */
    expect(await codeOf(() => reorderExerciseEntries(userId, session.id, [entries[0].id]))).toBe(
      "invalid",
    );
    /** A duplicate, standing in for a missing one. */
    expect(
      await codeOf(() =>
        reorderExerciseEntries(userId, session.id, [entries[0].id, entries[0].id, entries[1].id]),
      ),
    ).toBe("invalid");
    /** An id from nowhere. */
    expect(
      await codeOf(() =>
        reorderExerciseEntries(userId, session.id, [
          entries[0].id,
          entries[1].id,
          "00000000-0000-4000-8000-000000000000",
        ]),
      ),
    ).toBe("invalid");

    /** And the order is untouched by any of it. */
    expect(await namesInOrder(userId, session.id)).toEqual([
      "Barbell Bench Press",
      "Barbell Row",
      "Back Squat",
    ]);
  });

  it("refuses another user's session", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const { session, entries } = await sessionWithThree(owner);

    expect(
      await codeOf(() =>
        reorderExerciseEntries(stranger, session.id, [
          entries[2].id,
          entries[1].id,
          entries[0].id,
        ]),
      ),
    ).toBe("not_found");
  });
});

describe("weight", () => {
  it("comes back as a number, not the driver's string", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Back Squat"),
    });

    const set = await logSet(userId, entry.id, { reps: 5, weight: 62.5 });
    expect(set.weight).toBe(62.5);
    expect(typeof set.weight).toBe("number");

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises[0].sets[0].weight).toBe(62.5);
  });

  it("keeps two decimal places", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Barbell Curl"),
    });

    const set = await logSet(userId, entry.id, { reps: 12, weight: 17.25 });
    expect(set.weight).toBe(17.25);
  });
});

describe("editing a logged set", () => {
  it("changes only the fields it is given, and keeps the position", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Back Squat"),
    });
    await logSet(userId, entry.id, { reps: 5, weight: 100 });
    const second = await logSet(userId, entry.id, { reps: 5, weight: 1000 });

    const corrected = await editSet(userId, second.id, { weight: 100 });

    expect(corrected).toMatchObject({ position: 2, reps: 5, weight: 100, isWarmup: false });
    expect(typeof corrected.weight).toBe("number");
  });

  it("can reclassify a set as a warm-up, which removes it from volume", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Barbell Bench Press"),
    });
    const set = await logSet(userId, entry.id, { reps: 10, weight: 20 });

    const updated = await editSet(userId, set.id, { isWarmup: true });
    expect(updated.isWarmup).toBe(true);

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises[0].sets[0].isWarmup).toBe(true);
  });

  it("refuses another user's set", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const session = await startWorkoutSession(owner);
    const entry = await addExerciseEntry(owner, session.id, {
      exerciseId: await globalExercise(owner, "Deadlift"),
    });
    const set = await logSet(owner, entry.id, { reps: 5, weight: 140 });

    expect(await codeOf(() => editSet(stranger, set.id, { weight: 1 }))).toBe("not_found");

    const detail = await getWorkoutSession(owner, session.id);
    expect(detail.exercises[0].sets[0].weight).toBe(140);
  });
});

describe("ownership", () => {
  it("hides another user's session, entries and sets behind not_found", async () => {
    const owner = await createUser();
    const stranger = await createUser();

    const session = await startWorkoutSession(owner);
    const entry = await addExerciseEntry(owner, session.id, {
      exerciseId: await globalExercise(owner, "Deadlift"),
    });
    const set = await logSet(owner, entry.id, { reps: 5, weight: 140 });

    expect(await codeOf(() => getWorkoutSession(stranger, session.id))).toBe("not_found");
    expect(await codeOf(() => editWorkoutSession(stranger, session.id, { notes: "mine" }))).toBe(
      "not_found",
    );
    expect(await codeOf(() => removeWorkoutSession(stranger, session.id))).toBe("not_found");
    expect(
      await codeOf(() =>
        addExerciseEntry(stranger, session.id, { exerciseId: entry.exercise.id }),
      ),
    ).toBe("not_found");
    expect(await codeOf(() => logSet(stranger, entry.id, { reps: 1, weight: 1 }))).toBe(
      "not_found",
    );
    expect(await codeOf(() => removeExerciseEntry(stranger, entry.id))).toBe("not_found");
    expect(await codeOf(() => removeSet(stranger, set.id))).toBe("not_found");

    /** And none of it was touched. */
    const detail = await getWorkoutSession(owner, session.id);
    expect(detail.exercises).toHaveLength(1);
    expect(detail.exercises[0].sets).toHaveLength(1);
  });

  it("deletes a session's entries and sets with it", async () => {
    const userId = await createUser();
    const session = await startWorkoutSession(userId);
    const entry = await addExerciseEntry(userId, session.id, {
      exerciseId: await globalExercise(userId, "Deadlift"),
    });
    const set = await logSet(userId, entry.id, { reps: 5, weight: 100 });

    await removeWorkoutSession(userId, session.id);

    expect(await codeOf(() => getWorkoutSession(userId, session.id))).toBe("not_found");
    expect(await codeOf(() => removeSet(userId, set.id))).toBe("not_found");
  });
});

describe("starting a workout from a routine", () => {
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

  it("copies the routine's exercises, in order, with no sets", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", [
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);

    const session = await startWorkoutSessionFromRoutine(userId, routine.id);

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises.map((entry) => entry.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Overhead Press",
      "Dip",
    ]);
    expect(detail.exercises.map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(detail.exercises.every((entry) => entry.sets.length === 0)).toBe(true);
  });

  it("copies, so editing the routine afterwards leaves the session alone", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", ["Barbell Bench Press", "Dip"]);
    const session = await startWorkoutSessionFromRoutine(userId, routine.id);

    const [, dip] = (await getRoutine(userId, routine.id)).exercises;
    await removeRoutineExercise(userId, dip.id);
    await addRoutineExercise(userId, routine.id, {
      exerciseId: await globalExercise(userId, "Cable Fly"),
    });

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises.map((entry) => entry.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Dip",
    ]);
  });

  it("starts an empty session from an empty routine", async () => {
    const userId = await createUser();
    const routine = await createRoutine(userId, { name: "Someday" });

    const session = await startWorkoutSessionFromRoutine(userId, routine.id);

    expect((await getWorkoutSession(userId, session.id)).exercises).toEqual([]);
  });

  it("obeys the one-open-session rule, and leaves no session behind when it refuses", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", ["Barbell Bench Press"]);
    const open = await startWorkoutSession(userId);

    expect(await codeOf(() => startWorkoutSessionFromRoutine(userId, routine.id))).toBe("conflict");
    expect(await getActiveWorkoutSession(userId)).toMatchObject({ id: open.id });
  });

  it("refuses a stranger's routine as not_found, without starting anything", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const routine = await routineOf(owner, "Push Day", ["Barbell Bench Press"]);

    expect(await codeOf(() => startWorkoutSessionFromRoutine(stranger, routine.id))).toBe(
      "not_found",
    );
    expect(await getActiveWorkoutSession(stranger)).toBeNull();
  });

  it("refuses a start in the future", async () => {
    const userId = await createUser();
    const routine = await routineOf(userId, "Push Day", ["Barbell Bench Press"]);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    expect(
      await codeOf(() => startWorkoutSessionFromRoutine(userId, routine.id, { startedAt: tomorrow })),
    ).toBe("invalid");
  });
});

describe("starting a workout from a prebuilt routine", () => {
  it("copies the programme's exercises, in order, with their schemes and no sets", async () => {
    const userId = await createUser();
    const prebuilt = findPrebuiltRoutine("ppl-legs")!;

    const session = await startWorkoutSessionFromPrebuiltRoutine(userId, prebuilt.slug);

    const detail = await getWorkoutSession(userId, session.id);
    expect(detail.exercises.map((entry) => entry.exercise.name)).toEqual(
      prebuilt.exercises.map((line) => line.exercise),
    );
    expect(detail.exercises.map((entry) => entry.notes)).toEqual(
      prebuilt.exercises.map((line) => line.scheme),
    );
    expect(detail.exercises.map((entry) => entry.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(detail.exercises.every((entry) => entry.sets.length === 0)).toBe(true);
  });

  /** Starting keeps nothing: this is the whole difference from copying it. */
  it("writes no routine of its own", async () => {
    const userId = await createUser();

    await startWorkoutSessionFromPrebuiltRoutine(userId, "stronglifts-5x5-b");

    expect(await listRoutinesFor(userId)).toEqual([]);
  });

  it("obeys the one-open-session rule, and leaves no session behind when it refuses", async () => {
    const userId = await createUser();
    const open = await startWorkoutSession(userId);

    expect(await codeOf(() => startWorkoutSessionFromPrebuiltRoutine(userId, "ppl-push"))).toBe(
      "conflict",
    );
    expect(await getActiveWorkoutSession(userId)).toMatchObject({ id: open.id });
  });

  /** The slug is resolved before the guards, so this is not_found even with one open. */
  it("refuses an unknown slug as not_found, whether or not a session is open", async () => {
    const userId = await createUser();
    expect(await codeOf(() => startWorkoutSessionFromPrebuiltRoutine(userId, "nope"))).toBe(
      "not_found",
    );

    await startWorkoutSession(userId);
    expect(await codeOf(() => startWorkoutSessionFromPrebuiltRoutine(userId, "nope"))).toBe(
      "not_found",
    );
  });
});
