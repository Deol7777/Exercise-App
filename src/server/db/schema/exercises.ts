/**
 * The exercise catalog (ADR 0004).
 *
 * An *exercise* is a definition of a movement, never a performance of one —
 * that is an *exercise entry*, in `session_exercises`. See docs/glossary.md.
 *
 * `owner_id IS NULL` means a seeded global exercise visible to everyone; a
 * value means a private custom exercise. Every catalog read must filter
 * `owner_id IS NULL OR owner_id = <session user>` or it leaks other users'
 * custom exercises.
 */
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Relative, not the "@/" alias: drizzle-kit and the tsx seed script load this file outside Next's resolver. */
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";

import { users } from "./auth";

/**
 * Coarse enough that a movement lands in exactly one group, which is what the
 * volume-per-muscle-group aggregate needs. The values live in
 * src/lib/muscle-groups.ts because the client needs them too; this is only the
 * database's view of the same list.
 */
export const muscleGroup = pgEnum("muscle_group", MUSCLE_GROUPS);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = global, seeded, visible to everyone. Set = one user's private exercise. */
    ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    muscleGroup: muscleGroup("muscle_group").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Two partial uniques rather than one on (owner_id, name): in Postgres,
     * NULL is distinct from NULL, so a plain unique over the pair would let
     * the same global exercise be seeded twice.
     */
    uniqueIndex("exercises_global_name_unique")
      .on(table.name)
      .where(sql`${table.ownerId} is null`),
    uniqueIndex("exercises_owner_name_unique")
      .on(table.ownerId, table.name)
      .where(sql`${table.ownerId} is not null`),
    index("exercises_owner_id_idx").on(table.ownerId),
  ],
);
