import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Apply pending migrations from ./drizzle to whichever database is configured.
 * Works for both the local PGlite directory and a real Postgres.
 */

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    console.log("→ migrating Postgres (DATABASE_URL)");
    const sql = postgres(connectionString, { max: 1, prepare: false });
    try {
      await migratePostgres(drizzlePostgres(sql), { migrationsFolder: "./drizzle" });
      console.log("✓ migrations applied");
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  const dir = process.env.PGLITE_DIR ?? "./.pglite";
  console.log(`→ migrating local PGlite at ${dir}`);
  const client = new PGlite(dir);
  try {
    await migratePglite(drizzlePglite(client), { migrationsFolder: "./drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("✗ migration failed:", err);
  process.exit(1);
});
