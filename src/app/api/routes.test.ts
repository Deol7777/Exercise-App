/**
 * The HTTP edge. These tests call the route handlers directly with a `Request`,
 * with `currentUserId` mocked — the one thing that cannot be exercised from a
 * test process, and the one thing every handler's security rests on.
 *
 * What is being checked here is the contract the four steps produce:
 * 401 without a session, 404 for a bad or foreign id, 422 for a body that fails
 * its schema, and the right status on the way out. The domain rules underneath
 * have their own tests in src/server/services/.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUser, globalExercise } from "@/testing/factories";

vi.mock("@/server/auth", () => ({ currentUserId: vi.fn() }));

import { currentUserId } from "@/server/auth";
import { GLOBAL_EXERCISES } from "@/server/db/seed-data";

import { GET as getExercises, POST as postExercise } from "./exercises/route";
import { GET as getSessions, POST as postSession } from "./workout-sessions/route";
import {
  DELETE as deleteSession,
  GET as getSession,
  PATCH as patchSession,
} from "./workout-sessions/[id]/route";
import {
  PATCH as patchEntryOrder,
  POST as postEntry,
} from "./workout-sessions/[id]/exercises/route";
import { POST as postSet } from "./exercise-entries/[id]/sets/route";
import { DELETE as deleteSet, PATCH as patchSet } from "./sets/[id]/route";
import { GET as getRoutines, POST as postRoutine } from "./routines/route";
import { POST as postPrebuiltRoutine } from "./routines/prebuilt/route";
import {
  DELETE as deleteRoutine,
  GET as getRoutine,
  PATCH as patchRoutine,
} from "./routines/[id]/route";
import {
  PATCH as patchRoutineOrder,
  POST as postRoutineExercise,
} from "./routines/[id]/exercises/route";
import { DELETE as deleteRoutineExercise } from "./routine-exercises/[id]/route";
import { GET as getRecords } from "./progress/personal-records/route";
import { DELETE as deleteMe, GET as getMe, PATCH as patchMe } from "./users/me/route";

const signedInAs = (userId: string | null) =>
  vi.mocked(currentUserId).mockResolvedValue(userId);

const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const context = (id: string) => ({ params: Promise.resolve({ id }) });

const NOT_A_UUID = "not-a-uuid";
const UNUSED_UUID = "00000000-0000-4000-8000-000000000000";

beforeEach(() => {
  vi.mocked(currentUserId).mockReset();
});

describe("without a session", () => {
  it("answers 401 everywhere, and touches nothing", async () => {
    signedInAs(null);

    const responses = await Promise.all([
      getExercises(new NextRequest("http://localhost/api/exercises")),
      postExercise(json("/api/exercises", "POST", { name: "X", muscleGroup: "chest" })),
      getSessions(new NextRequest("http://localhost/api/workout-sessions")),
      postSession(json("/api/workout-sessions", "POST", {})),
      getSession(json(`/api/workout-sessions/${UNUSED_UUID}`, "GET"), context(UNUSED_UUID)),
      postSet(json(`/api/exercise-entries/${UNUSED_UUID}/sets`, "POST", { reps: 5, weight: 60 }), context(UNUSED_UUID)),
      getRecords(),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401, 401, 401]);
    await expect(responses[0].json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});

describe("path parameters", () => {
  it("answers 404 for an id that is not a UUID, before any query", async () => {
    signedInAs(await createUser());

    const responses = await Promise.all([
      getSession(json(`/api/workout-sessions/${NOT_A_UUID}`, "GET"), context(NOT_A_UUID)),
      deleteSession(json(`/api/workout-sessions/${NOT_A_UUID}`, "DELETE"), context(NOT_A_UUID)),
      postEntry(json(`/api/workout-sessions/${NOT_A_UUID}/exercises`, "POST", { exerciseId: UNUSED_UUID }), context(NOT_A_UUID)),
      deleteSet(json(`/api/sets/${NOT_A_UUID}`, "DELETE"), context(NOT_A_UUID)),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
  });
});

describe("request bodies", () => {
  it("answers 422 with field errors when the schema fails", async () => {
    signedInAs(await createUser());

    const response = await postExercise(
      json("/api/exercises", "POST", { name: "", muscleGroup: "elbows" }),
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; fields: Record<string, string[]> };
    expect(Object.keys(body.fields).sort()).toEqual(["muscleGroup", "name"]);
  });

  it("answers 422 for a body that is not JSON at all", async () => {
    signedInAs(await createUser());

    const response = await postSet(
      new Request(`http://localhost/api/exercise-entries/${UNUSED_UUID}/sets`, {
        method: "POST",
        body: "not json",
      }),
      context(UNUSED_UUID),
    );

    expect(response.status).toBe(422);
  });

  it("accepts an empty body when starting a workout session", async () => {
    signedInAs(await createUser());

    const response = await postSession(
      new Request("http://localhost/api/workout-sessions", { method: "POST" }),
    );

    expect(response.status).toBe(201);
  });
});

describe("the write path over HTTP", () => {
  it("starts a session, adds an exercise, logs a set and corrects it", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    expect(started.status).toBe(201);
    const session = (await started.json()) as { id: string };

    const added = await postEntry(
      json(`/api/workout-sessions/${session.id}/exercises`, "POST", {
        exerciseId: await globalExercise(userId, "Deadlift"),
      }),
      context(session.id),
    );
    expect(added.status).toBe(201);
    const entry = (await added.json()) as { id: string; position: number };
    expect(entry.position).toBe(1);

    const logged = await postSet(
      json(`/api/exercise-entries/${entry.id}/sets`, "POST", { reps: 5, weight: 100 }),
      context(entry.id),
    );
    expect(logged.status).toBe(201);
    const set = (await logged.json()) as { id: string; weight: number };
    expect(set.weight).toBe(100);

    const corrected = await patchSet(
      json(`/api/sets/${set.id}`, "PATCH", { weight: 102.5 }),
      context(set.id),
    );
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({ id: set.id, reps: 5, weight: 102.5 });
  });

  it("answers 409 for a second workout session", async () => {
    signedInAs(await createUser());
    await postSession(json("/api/workout-sessions", "POST", {}));

    const second = await postSession(json("/api/workout-sessions", "POST", {}));
    expect(second.status).toBe(409);
  });

  it("answers 204 with no body on delete", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    const session = (await started.json()) as { id: string };

    const deleted = await deleteSession(
      json(`/api/workout-sessions/${session.id}`, "DELETE"),
      context(session.id),
    );

    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");
  });
});

describe("the active workout session", () => {
  it("comes back with its exercise entries and sets, or null", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const empty = await getSessions(
      new NextRequest("http://localhost/api/workout-sessions?active=true"),
    );
    expect(await empty.json()).toBeNull();

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    const session = (await started.json()) as { id: string };
    const added = await postEntry(
      json(`/api/workout-sessions/${session.id}/exercises`, "POST", {
        exerciseId: await globalExercise(userId, "Deadlift"),
      }),
      context(session.id),
    );
    const entry = (await added.json()) as { id: string };
    await postSet(
      json(`/api/exercise-entries/${entry.id}/sets`, "POST", { reps: 5, weight: 100 }),
      context(entry.id),
    );

    /** One request, the whole screen: this is what the query cache holds. */
    const active = await getSessions(
      new NextRequest("http://localhost/api/workout-sessions?active=true"),
    );
    const body = (await active.json()) as {
      id: string;
      exercises: { sets: { reps: number; weight: number }[] }[];
    };

    expect(body.id).toBe(session.id);
    expect(body.exercises[0].sets).toEqual([
      expect.objectContaining({ reps: 5, weight: 100, position: 1 }),
    ]);
  });
});

describe("reordering over HTTP", () => {
  it("takes the full order and answers with the new positions", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    const session = (await started.json()) as { id: string };

    const ids: string[] = [];
    for (const name of ["Deadlift", "Barbell Row"]) {
      const added = await postEntry(
        json(`/api/workout-sessions/${session.id}/exercises`, "POST", {
          exerciseId: await globalExercise(userId, name),
        }),
        context(session.id),
      );
      ids.push(((await added.json()) as { id: string }).id);
    }

    const reordered = await patchEntryOrder(
      json(`/api/workout-sessions/${session.id}/exercises`, "PATCH", {
        order: [ids[1], ids[0]],
      }),
      context(session.id),
    );

    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual([
      { id: ids[1], position: 1 },
      { id: ids[0], position: 2 },
    ]);
  });

  it("answers 422 for an empty order and for a partial one", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    const session = (await started.json()) as { id: string };
    await postEntry(
      json(`/api/workout-sessions/${session.id}/exercises`, "POST", {
        exerciseId: await globalExercise(userId, "Deadlift"),
      }),
      context(session.id),
    );

    const empty = await patchEntryOrder(
      json(`/api/workout-sessions/${session.id}/exercises`, "PATCH", { order: [] }),
      context(session.id),
    );
    const foreign = await patchEntryOrder(
      json(`/api/workout-sessions/${session.id}/exercises`, "PATCH", {
        order: [UNUSED_UUID],
      }),
      context(session.id),
    );

    expect([empty.status, foreign.status]).toEqual([422, 422]);
  });
});

describe("one user's id in another user's path", () => {
  it("is a 404, and changes nothing", async () => {
    const owner = await createUser();
    signedInAs(owner);

    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    const session = (await started.json()) as { id: string };
    const added = await postEntry(
      json(`/api/workout-sessions/${session.id}/exercises`, "POST", {
        exerciseId: await globalExercise(owner, "Deadlift"),
      }),
      context(session.id),
    );
    const entry = (await added.json()) as { id: string };
    const logged = await postSet(
      json(`/api/exercise-entries/${entry.id}/sets`, "POST", { reps: 5, weight: 100 }),
      context(entry.id),
    );
    const set = (await logged.json()) as { id: string };

    signedInAs(await createUser());

    const responses = await Promise.all([
      getSession(json(`/api/workout-sessions/${session.id}`, "GET"), context(session.id)),
      patchSession(json(`/api/workout-sessions/${session.id}`, "PATCH", { notes: "mine now" }), context(session.id)),
      deleteSession(json(`/api/workout-sessions/${session.id}`, "DELETE"), context(session.id)),
      postSet(json(`/api/exercise-entries/${entry.id}/sets`, "POST", { reps: 1, weight: 1 }), context(entry.id)),
      patchSet(json(`/api/sets/${set.id}`, "PATCH", { reps: 99 }), context(set.id)),
      deleteSet(json(`/api/sets/${set.id}`, "DELETE"), context(set.id)),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);

    signedInAs(owner);
    const check = await getSession(json(`/api/workout-sessions/${session.id}`, "GET"), context(session.id));
    const detail = (await check.json()) as { notes: string | null; exercises: { sets: unknown[] }[] };
    expect(detail.notes).toBeNull();
    expect(detail.exercises[0].sets).toHaveLength(1);
  });
});

describe("the account endpoint", () => {
  it("reads and changes the display unit", async () => {
    signedInAs(await createUser());

    const before = await getMe();
    expect(await before.json()).toEqual({ weightUnit: "kg", theme: "rose" });

    const changed = await patchMe(json("/api/users/me", "PATCH", { weightUnit: "lb" }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ weightUnit: "lb", theme: "rose" });

    const after = await getMe();
    expect(await after.json()).toEqual({ weightUnit: "lb", theme: "rose" });
  });

  /** A body that names one setting leaves the other alone and still answers with both. */
  it("changes the theme without touching the unit", async () => {
    signedInAs(await createUser());
    await patchMe(json("/api/users/me", "PATCH", { weightUnit: "lb" }));

    const changed = await patchMe(json("/api/users/me", "PATCH", { theme: "court" }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ weightUnit: "lb", theme: "court" });
  });

  it("answers 401 without a session and 422 for a unit that does not exist", async () => {
    signedInAs(null);
    expect((await getMe()).status).toBe(401);
    expect((await patchMe(json("/api/users/me", "PATCH", { weightUnit: "lb" }))).status).toBe(401);

    signedInAs(await createUser());
    const bad = await patchMe(json("/api/users/me", "PATCH", { weightUnit: "stone" }));
    expect(bad.status).toBe(422);

    const noSuchTheme = await patchMe(json("/api/users/me", "PATCH", { theme: "chartreuse" }));
    expect(noSuchTheme.status).toBe(422);

    /** Nothing to change is a bad request, not a no-op write. */
    const nothing = await patchMe(json("/api/users/me", "PATCH", {}));
    expect(nothing.status).toBe(422);
  });
});

describe("deleting an account over HTTP", () => {
  it("answers 204, and the account is gone", async () => {
    const userId = await createUser();
    signedInAs(userId);

    /** Something to take with it. */
    const started = await postSession(json("/api/workout-sessions", "POST", {}));
    expect(started.status).toBe(201);

    const deleted = await deleteMe();
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe("");

    /** The JWT outlives the row, so a request with it now finds nothing. */
    expect((await getMe()).status).toBe(404);
    expect((await deleteMe()).status).toBe(404);
  });

  it("answers 401 without a session", async () => {
    signedInAs(null);
    expect((await deleteMe()).status).toBe(401);
  });
});

describe("the catalog over HTTP", () => {
  it("returns the seeded exercises and filters by search", async () => {
    signedInAs(await createUser());

    const all = await getExercises(new NextRequest("http://localhost/api/exercises"));
    expect(((await all.json()) as unknown[]).length).toBe(GLOBAL_EXERCISES.length);

    const filtered = await getExercises(
      new NextRequest("http://localhost/api/exercises?search=squat"),
    );
    const names = ((await filtered.json()) as { name: string }[]).map((row) => row.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => /squat/i.test(name))).toBe(true);
  });

  it("answers 409 for a duplicate custom exercise name", async () => {
    signedInAs(await createUser());
    const body = { name: "Zercher Squat", muscleGroup: "quads" };

    expect((await postExercise(json("/api/exercises", "POST", body))).status).toBe(201);
    expect((await postExercise(json("/api/exercises", "POST", body))).status).toBe(409);
  });
});

describe("starting a workout from a prebuilt routine over HTTP", () => {
  it("starts one from a slug, and keeps no routine for it", async () => {
    signedInAs(await createUser());

    const started = await postSession(
      json("/api/workout-sessions", "POST", { prebuiltId: "ppl-push" }),
    );
    expect(started.status).toBe(201);

    /** The same 409 a plain second start gets: one endpoint, one guard. */
    const again = await postSession(
      json("/api/workout-sessions", "POST", { prebuiltId: "ppl-pull" }),
    );
    expect(again.status).toBe(409);

    expect(await (await getRoutines()).json()).toEqual([]);
  });

  it("answers 404 for an unknown slug and 422 for an empty one", async () => {
    signedInAs(await createUser());

    const responses = await Promise.all([
      postSession(json("/api/workout-sessions", "POST", { prebuiltId: "nope" })),
      postSession(json("/api/workout-sessions", "POST", { prebuiltId: "  " })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 422]);
  });
});

describe("copying a prebuilt routine over HTTP", () => {
  it("creates a real routine of this user's, and answers 409 on a second copy", async () => {
    signedInAs(await createUser());
    const body = { prebuiltId: "stronglifts-5x5-a" };

    const created = await postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", body));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ name: "StrongLifts 5×5 · Workout A" });

    const again = await postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", body));
    expect(again.status).toBe(409);
  });

  it("answers 404 for a slug no prebuilt routine has, and 422 for a body without one", async () => {
    signedInAs(await createUser());

    const responses = await Promise.all([
      postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", { prebuiltId: "nope" })),
      postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", {})),
      postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", { prebuiltId: "  " })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 422, 422]);
  });
});

describe("routines over HTTP", () => {
  /** A routine holding `names`, and the parsed body of its detail read. */
  async function routineOf(userId: string, name: string, names: string[]) {
    const created = await postRoutine(json("/api/routines", "POST", { name }));
    const { id } = (await created.json()) as { id: string };

    for (const exercise of names) {
      await postRoutineExercise(
        json(`/api/routines/${id}/exercises`, "POST", {
          exerciseId: await globalExercise(userId, exercise),
        }),
        context(id),
      );
    }

    return id;
  }

  it("answers 401 everywhere without a session", async () => {
    signedInAs(null);

    const responses = await Promise.all([
      getRoutines(),
      postRoutine(json("/api/routines", "POST", { name: "Push Day" })),
      getRoutine(json(`/api/routines/${UNUSED_UUID}`, "GET"), context(UNUSED_UUID)),
      patchRoutine(json(`/api/routines/${UNUSED_UUID}`, "PATCH", { name: "x" }), context(UNUSED_UUID)),
      deleteRoutine(json(`/api/routines/${UNUSED_UUID}`, "DELETE"), context(UNUSED_UUID)),
      postRoutineExercise(
        json(`/api/routines/${UNUSED_UUID}/exercises`, "POST", { exerciseId: UNUSED_UUID }),
        context(UNUSED_UUID),
      ),
      patchRoutineOrder(
        json(`/api/routines/${UNUSED_UUID}/exercises`, "PATCH", { order: [UNUSED_UUID] }),
        context(UNUSED_UUID),
      ),
      deleteRoutineExercise(
        json(`/api/routine-exercises/${UNUSED_UUID}`, "DELETE"),
        context(UNUSED_UUID),
      ),
      postPrebuiltRoutine(json("/api/routines/prebuilt", "POST", { prebuiltId: "ppl-push" })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  it("answers 404 for a malformed id and for one that is not this user's", async () => {
    const owner = await createUser();
    signedInAs(owner);
    const routineId = await routineOf(owner, "Push Day", ["Barbell Bench Press"]);

    signedInAs(await createUser());

    const responses = await Promise.all([
      getRoutine(json(`/api/routines/${NOT_A_UUID}`, "GET"), context(NOT_A_UUID)),
      getRoutine(json(`/api/routines/${routineId}`, "GET"), context(routineId)),
      patchRoutine(json(`/api/routines/${routineId}`, "PATCH", { name: "Mine" }), context(routineId)),
      deleteRoutine(json(`/api/routines/${routineId}`, "DELETE"), context(routineId)),
      deleteRoutineExercise(
        json(`/api/routine-exercises/${NOT_A_UUID}`, "DELETE"),
        context(NOT_A_UUID),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
  });

  it("answers 422 for a body that fails its schema", async () => {
    const userId = await createUser();
    signedInAs(userId);
    const routineId = await routineOf(userId, "Push Day", []);

    const responses = await Promise.all([
      postRoutine(json("/api/routines", "POST", { name: "   " })),
      postRoutine(json("/api/routines", "POST", {})),
      patchRoutine(json(`/api/routines/${routineId}`, "PATCH", {}), context(routineId)),
      postRoutineExercise(
        json(`/api/routines/${routineId}/exercises`, "POST", { exerciseId: NOT_A_UUID }),
        context(routineId),
      ),
      patchRoutineOrder(
        json(`/api/routines/${routineId}/exercises`, "PATCH", { order: [] }),
        context(routineId),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422, 422, 422, 422]);
  });

  it("answers 409 for a duplicate routine name", async () => {
    signedInAs(await createUser());
    const body = { name: "Push Day" };

    expect((await postRoutine(json("/api/routines", "POST", body))).status).toBe(201);
    expect((await postRoutine(json("/api/routines", "POST", body))).status).toBe(409);
  });

  it("creates, reads, reorders and deletes over HTTP", async () => {
    const userId = await createUser();
    signedInAs(userId);
    const routineId = await routineOf(userId, "Push Day", ["Barbell Bench Press", "Dip"]);

    const listed = (await (await getRoutines()).json()) as { exerciseCount: number }[];
    expect(listed).toMatchObject([{ exerciseCount: 2 }]);

    const detail = (await (
      await getRoutine(json(`/api/routines/${routineId}`, "GET"), context(routineId))
    ).json()) as { exercises: { id: string; exercise: { name: string } }[] };
    expect(detail.exercises.map((line) => line.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Dip",
    ]);

    const reversed = [...detail.exercises].reverse().map((line) => line.id);
    const reorder = await patchRoutineOrder(
      json(`/api/routines/${routineId}/exercises`, "PATCH", { order: reversed }),
      context(routineId),
    );
    expect(reorder.status).toBe(200);

    /** A partial order is a 422, not a silent truncation of the routine. */
    const partial = await patchRoutineOrder(
      json(`/api/routines/${routineId}/exercises`, "PATCH", { order: [reversed[0]] }),
      context(routineId),
    );
    expect(partial.status).toBe(422);

    const removed = await deleteRoutineExercise(
      json(`/api/routine-exercises/${detail.exercises[0].id}`, "DELETE"),
      context(detail.exercises[0].id),
    );
    expect(removed.status).toBe(204);

    const deleted = await deleteRoutine(
      json(`/api/routines/${routineId}`, "DELETE"),
      context(routineId),
    );
    expect(deleted.status).toBe(204);
    expect((await (await getRoutines()).json()) as unknown[]).toEqual([]);
  });
});

describe("starting a workout from a routine over HTTP", () => {
  it("returns 201 and a session holding the routine's exercises", async () => {
    const userId = await createUser();
    signedInAs(userId);

    const created = await postRoutine(json("/api/routines", "POST", { name: "Push Day" }));
    const { id: routineId } = (await created.json()) as { id: string };
    for (const name of ["Barbell Bench Press", "Dip"]) {
      await postRoutineExercise(
        json(`/api/routines/${routineId}/exercises`, "POST", {
          exerciseId: await globalExercise(userId, name),
        }),
        context(routineId),
      );
    }

    const started = await postSession(json("/api/workout-sessions", "POST", { routineId }));
    expect(started.status).toBe(201);
    const { id: sessionId } = (await started.json()) as { id: string };

    const detail = (await (
      await getSession(json(`/api/workout-sessions/${sessionId}`, "GET"), context(sessionId))
    ).json()) as { exercises: { exercise: { name: string } }[] };
    expect(detail.exercises.map((entry) => entry.exercise.name)).toEqual([
      "Barbell Bench Press",
      "Dip",
    ]);
  });

  it("answers 404 for another user's routine, and 422 for a malformed one", async () => {
    const owner = await createUser();
    signedInAs(owner);
    const created = await postRoutine(json("/api/routines", "POST", { name: "Push Day" }));
    const { id: routineId } = (await created.json()) as { id: string };

    signedInAs(await createUser());

    expect(
      (await postSession(json("/api/workout-sessions", "POST", { routineId }))).status,
    ).toBe(404);
    expect(
      (await postSession(json("/api/workout-sessions", "POST", { routineId: NOT_A_UUID }))).status,
    ).toBe(422);
  });
});
