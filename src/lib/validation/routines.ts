/**
 * Request schemas for routines, shared by the forms that send a body and the
 * route handlers that receive one. Client-safe: imports nothing from
 * src/server/**.
 *
 * As next door in ./training.ts, nothing here accepts a user id or a
 * `position`. Identity comes from the auth session, and order is assigned by
 * the database — see src/server/db/queries/positions.ts.
 */
import { z } from "zod";

import { notes } from "./training";

const name = z.string().trim().min(1, "Name the routine.").max(120);

export const createRoutineSchema = z.object({
  name,
  notes: notes.optional(),
});

/**
 * A partial update. `notes: null` clears the note, so an explicit null is a
 * value here, not a missing field — hence `.nullable()` rather than
 * `.optional()` alone. The name itself cannot be cleared; a routine without one
 * is unreachable in a list.
 */
export const updateRoutineSchema = z
  .object({
    name: name.optional(),
    notes: notes.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

/**
 * Copying a shipped programme into your own routines. The id is a slug from
 * src/lib/prebuilt-routines.ts, not a uuid — prebuilt routines are content in
 * the codebase, not rows — and whether it names a real one is the service's
 * question, not the schema's.
 */
export const copyPrebuiltRoutineSchema = z.object({
  prebuiltId: z.string().trim().min(1, "Pick a routine.").max(120),
});

export const addRoutineExerciseSchema = z.object({
  exerciseId: z.uuid("Pick an exercise."),
  notes: notes.optional(),
});

/**
 * The new order of a routine's exercises: every one of them, once, in the order
 * they should appear. Positions themselves are still not client input — the
 * server derives 1..n from this list.
 */
export const reorderRoutineExercisesSchema = z.object({
  order: z.array(z.uuid()).min(1, "List the exercises in their new order."),
});

export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
export type CopyPrebuiltRoutineInput = z.infer<typeof copyPrebuiltRoutineSchema>;
export type AddRoutineExerciseInput = z.infer<typeof addRoutineExerciseSchema>;
export type ReorderRoutineExercisesInput = z.infer<typeof reorderRoutineExercisesSchema>;
