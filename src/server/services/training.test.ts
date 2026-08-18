/**
 * The write path's rules, against a real Postgres: ordering, the one-open-session
 * rule, and the ownership scoping that every training query depends on.
 */
import { describe, expect, it } from "vitest";

import { createUser, globalExercise } from "@/test/factories";

import { DomainError } from "../errors";
import {
  addExerciseEntry,
  editSet,
  editWorkoutSession,
  finishWorkoutSession,
  getActiveWorkoutSession,
  getWorkoutSession,
  logSet,
  removeExerciseEntry,
  removeSet,
  removeWorkoutSession,
  startWorkoutSession,
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
