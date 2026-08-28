/**
 * Auth.js v5 tables, owned by us rather than by an identity provider
 * (ADR 0005). The shape is dictated by @auth/drizzle-adapter — column names
 * and types here must match what the adapter expects.
 *
 * `sessions` is part of the adapter's contract but goes unused while the
 * Credentials provider is the only way in, since credentials sign-in forces
 * JWT sessions. It is kept so that adding an OAuth provider later is a
 * configuration change and not a migration.
 */
import { integer, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { THEMES } from "../../../lib/theme";
import { WEIGHT_UNITS } from "../../../lib/weight";

/**
 * A *display* preference and nothing more. Every weight in this database is
 * kilograms; this decides what the user is shown and what their input is
 * converted from.
 */
export const weightUnit = pgEnum("weight_unit", WEIGHT_UNITS);

/**
 * The colour palette the app is drawn in. Presentation only, like the unit
 * above: the values live in src/lib/theme.ts because the settings control and
 * the layout both need them, and this is only the database's view of the list.
 */
export const theme = pgEnum("theme", THEMES);

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
  /**
   * bcrypt hash for the Credentials provider. Nullable: a user who signs up
   * through an OAuth provider later will never have one.
   */
  passwordHash: text("password_hash"),
  weightUnit: weightUnit("weight_unit").notNull().default("kg"),
  theme: theme("theme").notNull().default("rose"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
