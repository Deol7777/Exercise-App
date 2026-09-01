/**
 * The single database handle. Data access lives in this directory; nothing
 * above it (route handlers, server components) opens a connection or writes
 * SQL of its own.
 */
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as auth from "@/server/db/schema/auth";
import * as exercises from "@/server/db/schema/exercises";
import * as routines from "@/server/db/schema/routines";
import * as security from "@/server/db/schema/security";
import * as training from "@/server/db/schema/training";

/**
 * Drizzle wants every table in one object for its relational queries. Built by
 * hand from the schema modules rather than by re-exporting them through a
 * barrel: a table is imported from the file that declares it, and this is the
 * only place that needs all of them at once.
 */
const schema = { ...auth, ...exercises, ...routines, ...security, ...training };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

/**
 * The POOLED Neon string (host contains `-pooler`), because a serverless
 * invocation may open its own connection. drizzle-kit gets the direct one
 * instead — see drizzle.config.ts. Swapping the two fails only under load.
 */
const createPool = () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  /** No-op off Vercel; on Fluid compute it drains the pool before suspend. */
  attachDatabasePool(pool);
  return pool;
};

/**
 * Next's dev server re-evaluates modules on every edit, which would leak a
 * pool per reload. Cache it on globalThis in development only.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
