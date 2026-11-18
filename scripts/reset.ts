import "dotenv/config";
import { rm } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Nuke the database. Destructive on purpose, dev only.
 *
 *   npm run db:reset           # local PGlite
 *   npm run db:reset -- --force  # even against DATABASE_URL
 */

async function main() {
  const force = process.argv.includes("--force");
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    if (!force) {
      console.error("✗ DATABASE_URL is set. This would wipe a real database.");
      console.error("  Re-run with: npm run db:reset -- --force");
      process.exit(1);
    }
    console.log("→ dropping schema public (DATABASE_URL)");
    const sqlClient = postgres(connectionString, { max: 1, prepare: false });
    try {
      const db = drizzlePostgres(sqlClient);
      await db.execute(sql`drop schema public cascade`);
      await db.execute(sql`create schema public`);
      console.log("✓ schema recreated empty. Run npm run db:migrate && npm run db:seed");
    } finally {
      await sqlClient.end({ timeout: 5 });
    }
    return;
  }

  const dir = process.env.PGLITE_DIR ?? "./.pglite";
  console.log(`→ deleting ${dir}`);
  await rm(dir, { recursive: true, force: true });
  console.log("✓ local database removed. Run npm run db:migrate && npm run db:seed");

  // Sanity: PGlite must be importable even though we only delete here.
  void PGlite;
  void drizzlePglite;
}

main().catch((err) => {
  console.error("✗ reset failed:", err);
  process.exit(1);
});
