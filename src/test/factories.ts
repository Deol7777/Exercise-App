/**
 * Test data builders. They insert directly rather than going through a service,
 * so a test about one behaviour does not depend on another one working.
 */
import { db } from "../server/db";
import { users } from "../server/db/schema";
import { listVisibleExercises } from "../server/db/queries/exercises";

let counter = 0;

export async function createUser(): Promise<string> {
  counter += 1;
  const [user] = await db
    .insert(users)
    .values({ email: `user-${counter}-${Date.now()}@example.test` })
    .returning({ id: users.id });

  return user.id;
}

/** A seeded global exercise, by name — the catalog is the same in every run. */
export async function globalExercise(userId: string, name: string): Promise<string> {
  const catalog = await listVisibleExercises(userId, { search: name });
  const match = catalog.find((exercise) => exercise.name === name);
  if (!match) throw new Error(`No seeded exercise named ${name}`);
  return match.id;
}
