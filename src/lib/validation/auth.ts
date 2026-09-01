/**
 * Schemas shared by the sign-in/sign-up forms and the route handlers that
 * receive them. Client-safe on purpose: it imports nothing from src/server/**.
 */
import { z } from "zod";

import { THEMES } from "@/lib/theme";
import { WEIGHT_UNITS } from "@/lib/weight";

/**
 * bcrypt silently truncates anything past 72 bytes, so a longer password would
 * quietly not be fully checked. Reject it at the edge instead.
 */
const MAX_PASSWORD_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
    `Use at most ${MAX_PASSWORD_BYTES} bytes — bcrypt ignores anything beyond that.`,
  );

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: passwordSchema,
  name: z.string().trim().max(120).optional(),
});

/**
 * The signed-in user's own settings. The id is never in the body — it is the
 * session's.
 *
 * Both fields are optional because Settings changes one control at a time, but
 * an empty body is refused: it would reach the data access layer as an
 * `update ... set` with nothing in it.
 */
export const updateAccountSchema = z
  .object({
    weightUnit: z.enum(WEIGHT_UNITS).optional(),
    theme: z.enum(THEMES).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "Name at least one setting to change.");

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
