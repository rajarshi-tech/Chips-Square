import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Local dev uses PGlite (a directory, no server). Set DATABASE_URL to switch to real Postgres,
 * which is what production does. Same schema, same migrations either way:
 *
 *   npm run db:generate   # write a new SQL migration from schema changes
 *   npm run db:migrate    # apply pending migrations
 */

const connectionString = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(connectionString
    ? { dbCredentials: { url: connectionString } }
    : { driver: "pglite", dbCredentials: { url: process.env.PGLITE_DIR ?? "./.pglite" } }),
});
