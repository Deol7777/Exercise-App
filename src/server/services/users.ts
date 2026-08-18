/**
 * User registration and credential checking.
 *
 * Knows nothing about HTTP: it takes plain values, returns plain values, and
 * throws typed domain errors from src/server/errors.ts.
 */
import { compare, hash } from "bcryptjs";

import type { WeightUnit } from "@/lib/weight";

import {
  clearFailures,
  countRecentFailures,
  deleteFailuresBefore,
  recordFailure,
} from "../db/queries/sign-in-attempts";
import {
  deleteAccount as deleteAccountRows,
  findUserByEmail,
  findWeightUnit,
  insertUser,
  updateWeightUnit,
} from "../db/queries/users";
import { isUniqueViolation } from "../db/pg-errors";
import { ConflictError, NotFoundError } from "../errors";

/**
 * 12 rounds: comfortably above the 10 that has been the default for a decade,
 * and still well under the latency budget of a sign-in.
 *
 * Under `NODE_ENV=test` it drops to 4. The throttle tests make twenty-odd
 * credential checks each, and at cost 12 that is half a minute of deliberate
 * key stretching per file. The override is keyed on the test environment
 * specifically — not on a tunable env var — so there is no configuration a
 * deployment could get wrong.
 */
const BCRYPT_COST = process.env.NODE_ENV === "test" ? 4 : 12;

export type PublicUser = { id: string; email: string; name: string | null };

export async function registerUser(input: {
  email: string;
  password: string;
  name?: string | null;
}): Promise<PublicUser> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new ConflictError("An account with that email already exists.");
  }

  const passwordHash = await hash(input.password, BCRYPT_COST);

  try {
    return await insertUser({
      email: input.email,
      name: input.name?.trim() || null,
      passwordHash,
    });
  } catch (error) {
    /**
     * The check above is not a lock: two registrations for the same address can
     * both pass it and race to the insert. `users.email` is unique, so the
     * loser gets a constraint violation, and it means the same thing the check
     * does — an account already exists.
     */
    if (isUniqueViolation(error)) {
      throw new ConflictError("An account with that email already exists.");
    }
    throw error;
  }
}

/**
 * How fast a password can be guessed at, per email address.
 *
 * Ten wrong answers inside fifteen minutes and that address stops being
 * checked until the window rolls forward. It is per address, so a real user
 * locked out by somebody else's guessing waits fifteen minutes rather than
 * losing the account.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Returns the user when the password matches, and null in every failure case —
 * unknown email, wrong password and throttled are deliberately
 * indistinguishable to the caller, so none of them can be used to enumerate
 * accounts or to discover that an address is being attacked.
 */
export async function verifyCredentials(input: {
  email: string;
  password: string;
}): Promise<PublicUser | null> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  /** No scheduler in this app: expired rows are swept on the next attempt. */
  await deleteFailuresBefore(windowStart);

  if ((await countRecentFailures(input.email, windowStart)) >= MAX_FAILURES) {
    /** Hash anyway, so a throttled answer is not measurably faster than a wrong one. */
    await hash(input.password, BCRYPT_COST);
    return null;
  }

  const user = await findUserByEmail(input.email);

  if (!user?.passwordHash) {
    /**
     * Hash anyway. Returning early for an unknown email makes the response
     * measurably faster than a wrong password, which leaks which emails exist.
     */
    await hash(input.password, BCRYPT_COST);
    await recordFailure(input.email);
    return null;
  }

  const matches = await compare(input.password, user.passwordHash);
  if (!matches) {
    await recordFailure(input.email);
    return null;
  }

  await clearFailures(input.email);

  return { id: user.id, email: user.email, name: user.name };
}

/**
 * The user's display unit. Kilograms is the default and the stored unit, so a
 * missing preference is not an error — but a missing *user* is.
 */
export async function getWeightUnit(userId: string): Promise<WeightUnit> {
  const unit = await findWeightUnit(userId);
  if (!unit) throw new NotFoundError("That account does not exist.");
  return unit;
}

export async function setWeightUnit(userId: string, weightUnit: WeightUnit): Promise<WeightUnit> {
  const updated = await updateWeightUnit(userId, weightUnit);
  if (!updated) throw new NotFoundError("That account does not exist.");
  return updated;
}

/**
 * Deletes the account and all of its training data. There is no soft delete and
 * no recovery window: the rows are gone when this returns (ADR 0013).
 */
export async function deleteAccount(userId: string): Promise<void> {
  const deleted = await deleteAccountRows(userId);
  if (!deleted) throw new NotFoundError("That account does not exist.");
}
