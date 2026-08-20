/**
 * Catalog visibility: the invariant that a missing `owner_id IS NULL OR
 * owner_id = <user>` filter leaks one user's private exercises to another.
 */
import { describe, expect, it } from "vitest";

import { createUser } from "@/test/factories";

import { GLOBAL_EXERCISES } from "../db/seed-data";
import { DomainError } from "../errors";
import { createCustomExercise, getExercise, listExercises } from "./exercises";

describe("the catalog", () => {
  it("shows every seeded global exercise", async () => {
    const userId = await createUser();
    const catalog = await listExercises(userId);

    expect(catalog).toHaveLength(GLOBAL_EXERCISES.length);
    expect(catalog.every((exercise) => !exercise.isCustom)).toBe(true);
    /** Alphabetical, so a picker does not need to sort. */
    expect(catalog.map((exercise) => exercise.name)).toEqual(
      [...catalog.map((exercise) => exercise.name)].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("adds a custom exercise for its owner and nobody else", async () => {
    const owner = await createUser();
    const stranger = await createUser();

    const custom = await createCustomExercise(owner, {
      name: "Zercher Squat",
      muscleGroup: "quads",
    });

    const ownerCatalog = await listExercises(owner);
    expect(ownerCatalog).toHaveLength(GLOBAL_EXERCISES.length + 1);
    expect(ownerCatalog.find((exercise) => exercise.id === custom.id)?.isCustom).toBe(true);

    const strangerCatalog = await listExercises(stranger);
    expect(strangerCatalog).toHaveLength(GLOBAL_EXERCISES.length);
    expect(strangerCatalog.some((exercise) => exercise.id === custom.id)).toBe(false);
  });

  it("hides another user's custom exercise behind not_found", async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const custom = await createCustomExercise(owner, { name: "Jefferson Curl", muscleGroup: "back" });

    await expect(getExercise(stranger, custom.id)).rejects.toBeInstanceOf(DomainError);
    await expect(getExercise(owner, custom.id)).resolves.toMatchObject({ id: custom.id });
  });

  it("refuses a duplicate name for the same user, and allows it for another", async () => {
    const owner = await createUser();
    const other = await createUser();
    await createCustomExercise(owner, { name: "Zercher Squat", muscleGroup: "quads" });

    await expect(
      createCustomExercise(owner, { name: "Zercher Squat", muscleGroup: "quads" }),
    ).rejects.toMatchObject({ code: "conflict" });

    await expect(
      createCustomExercise(other, { name: "Zercher Squat", muscleGroup: "quads" }),
    ).resolves.toMatchObject({ isCustom: true });
  });

  it("filters by name, case-insensitively", async () => {
    const userId = await createUser();

    const results = await listExercises(userId, { search: "squat" });
    expect(results.length).toBeGreaterThan(1);
    expect(results.every((exercise) => /squat/i.test(exercise.name))).toBe(true);
  });
});
