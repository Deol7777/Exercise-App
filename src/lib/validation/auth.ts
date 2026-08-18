/**
 * Schemas shared by the sign-in/sign-up forms and the route handlers that
 * receive them. Client-safe on purpose: it imports nothing from src/server/**.
 */
import { z } from "zod";

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

export type SignInInput = z.infer<typeof signInSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
