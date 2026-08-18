/**
 * Data access for `users`. Drizzle lives here and only here — services call
 * these functions, and nothing above the service layer sees a query.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "..";
import { users } from "../schema";

/** Email is stored as given but matched case-insensitively; addresses are not case-sensitive in practice. */
const emailMatches = (email: string) => sql`lower(${users.email}) = lower(${email})`;

export type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
};

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(emailMatches(email))
    .limit(1);

  return row ?? null;
}

export async function insertUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
}): Promise<{ id: string; email: string; name: string | null }> {
  const [row] = await db
    .insert(users)
    .values(input)
    .returning({ id: users.id, email: users.email, name: users.name });

  return row;
}

export async function userExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return row !== undefined;
}
