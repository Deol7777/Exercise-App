/**
 * User registration and credential checking.
 *
 * Knows nothing about HTTP: it takes plain values, returns plain values, and
 * throws typed domain errors from src/server/errors.ts.
 */
import { compare, hash } from "bcryptjs";

import { findUserByEmail, insertUser } from "../db/queries/users";
import { ConflictError } from "../errors";

/**
 * 12 rounds: comfortably above the 10 that has been the default for a decade,
 * and still well under the latency budget of a sign-in.
 */
const BCRYPT_COST = 12;

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

  return insertUser({
    email: input.email,
    name: input.name?.trim() || null,
    passwordHash,
  });
}

/**
 * Returns the user when the password matches, and null in every failure case —
 * unknown email and wrong password are deliberately indistinguishable to the
 * caller, so neither can be used to enumerate accounts.
 */
export async function verifyCredentials(input: {
  email: string;
  password: string;
}): Promise<PublicUser | null> {
  const user = await findUserByEmail(input.email);

  if (!user?.passwordHash) {
    /**
     * Hash anyway. Returning early for an unknown email makes the response
     * measurably faster than a wrong password, which leaks which emails exist.
     */
    await hash(input.password, BCRYPT_COST);
    return null;
  }

  const matches = await compare(input.password, user.passwordHash);
  if (!matches) return null;

  return { id: user.id, email: user.email, name: user.name };
}
