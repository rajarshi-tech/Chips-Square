/**
 * Keep the partner list in step with the account list.
 *
 *   npm run partners:sync
 *
 * Every admin and owner shares the profit of each cycle, so every account should have a `partners`
 * row. New accounts get one automatically when they are created; this command is for accounts that
 * already existed, and for a database that was deployed before that rule.
 *
 * It is safe to run twice, and safe to run on real data:
 *   - it only INSERTs partners for accounts that have none,
 *   - it never edits an existing partner (name, share, join date),
 *   - it never touches settlements, settlement shares, purchases or sales.
 */

import "dotenv/config";
import { listAccountsMissingPartner, syncPartnersFromUsers } from "../src/lib/partners";

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("→ using DATABASE_URL (this is the real database)");
  }

  const missing = await listAccountsMissingPartner();
  if (missing.length === 0) {
    console.log("✓ Every account is already a partner. Nothing to do.");
    return;
  }

  console.log(`→ ${missing.length} account(s) without a partner row:`);
  for (const account of missing) console.log(`   ${account.email}`);

  const { created } = await syncPartnersFromUsers();
  console.log(`✓ Added ${created.length} partner(s): ${created.join(", ")}`);
  console.log("  Existing partners, shares and settlements were not changed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗", err instanceof Error ? err.message : err);
    process.exit(1);
  });
