import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database access.
 *
 * Local dev  -> PGlite (Postgres compiled to WASM, data in ./.pglite). Zero install, real SQL.
 * Production -> any Postgres via DATABASE_URL (Neon / Supabase / Railway).
 *
 * Both back ends expose the same Drizzle API, so callers import `db` and never care which runs.
 * The connection is created on FIRST USE, never at import time: `next build` walks every route,
 * and a database handle opened during that walk leaks file locks and breaks prerendering.
 *
 * Server-side only. Never import this from a Client Component.
 */

export type Database = PostgresJsDatabase<typeof schema>;

type DbGlobal = typeof globalThis & {
  __chipsDb?: Database;
};

const g = globalThis as DbGlobal;

function createDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    const sql = postgres(connectionString, {
      max: 5,
      idle_timeout: 20,
      // Pooled endpoints (Neon, Supabase pgbouncer) require this; harmless for a plain server.
      prepare: false,
    });
    return drizzlePostgres(sql, { schema }) as unknown as Database;
  }

  const dir = process.env.PGLITE_DIR ?? "./.pglite";
  const client = new PGlite(dir);
  return drizzlePglite(client, { schema }) as unknown as Database;
}

/** The real connection, created once per process (cached across Next.js hot reloads). */
export function getDb(): Database {
  if (!g.__chipsDb) {
    g.__chipsDb = createDatabase();
    if (process.env.NODE_ENV !== "production") {
      // Vercel replaces functions, not the module scope, so this only matters for `next dev`.
    }
  }
  return g.__chipsDb;
}

/**
 * Lazy proxy so call sites can keep writing `db.select(...)` without a `getDb()` on every line,
 * while still deferring the connection until the first real query.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (getDb() as unknown as object);
  },
});

/** True when running against the throwaway local database. */
export const isLocalDb = !process.env.DATABASE_URL;

export { schema };
