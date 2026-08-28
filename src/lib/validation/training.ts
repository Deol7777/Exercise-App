/**
 * Request schemas for the training write path, shared by the forms that send a
 * body and the route handlers that receive one. Client-safe: imports nothing
 * from src/server/**.
 *
 * Nothing here accepts a user id or a `position`. Identity comes from the auth
 * session, and order is assigned by the database — see
 * src/server/db/queries/training.ts.
 */
import { z } from "zod";

import { MUSCLE_GROUPS } from "../muscle-groups";

/** Shared with the routine schemas next door. */
export const notes = z.string().trim().max(2_000, "Keep notes under 2000 characters.");

/** `numeric(6, 2)` in kilograms: four digits before the point, two after. */
const WEIGHT_MAX_KG = 9_999.99;

export const createWorkoutSessionSchema = z.object({
  /** Defaults to now in the database when omitted; sent only when back-dating. */
  startedAt: z.iso.datetime({ offset: true }).optional(),
  notes: notes.optional(),
  /**
   * Start from a routine: its exercises are copied into the new session. One
   * start endpoint rather than two, because both paths need the identical
   * one-open-session and no-future-start guards.
   */
  routineId: z.uuid("Pick a routine.").optional(),
});

/**
 * A partial update. `endedAt: null` reopens a finished workout session and
 * `notes: null` clears the note, so an explicit null is a value here, not a
 * missing field — hence `.nullable()` rather than `.optional()` alone.
 */
export const updateWorkoutSessionSchema = z
  .object({
    endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    notes: notes.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

export const addExerciseEntrySchema = z.object({
  exerciseId: z.uuid("Pick an exercise."),
  notes: notes.optional(),
});

export const addSetSchema = z.object({
  reps: z.int().min(1, "At least one rep.").max(1_000),
  /**
   * Kilograms, always — a display unit in pounds is converted before it gets
   * here. Bodyweight movements are a legitimate 0.
   */
  weight: z
    .number()
    .min(0, "Weight cannot be negative.")
    .max(WEIGHT_MAX_KG)
    .refine((value) => Number.isFinite(value) && Math.round(value * 100) === value * 100, {
      message: "Weight is stored to two decimal places.",
    }),
  isWarmup: z.boolean().optional(),
});

/**
 * A partial edit of a logged set. Every field is optional, but sending none is
 * a mistake rather than a no-op, so it is rejected.
 */
export const updateSetSchema = addSetSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Send at least one field to change.");

/**
 * The new order of a session's exercise entries: every entry id, once, in the
 * order they should appear. Positions themselves are still not client input —
 * the server derives 1..n from this list.
 */
export const reorderExerciseEntriesSchema = z.object({
  order: z.array(z.uuid()).min(1, "List the exercises in their new order."),
});

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, "Name the exercise.").max(120),
  muscleGroup: z.enum(MUSCLE_GROUPS, "Pick a muscle group."),
});

export type CreateWorkoutSessionInput = z.infer<typeof createWorkoutSessionSchema>;
export type UpdateWorkoutSessionInput = z.infer<typeof updateWorkoutSessionSchema>;
export type AddExerciseEntryInput = z.infer<typeof addExerciseEntrySchema>;
export type AddSetInput = z.infer<typeof addSetSchema>;
export type UpdateSetInput = z.infer<typeof updateSetSchema>;
export type ReorderExerciseEntriesInput = z.infer<typeof reorderExerciseEntriesSchema>;
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
