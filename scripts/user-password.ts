/**
 * Set (or reset) a password for an email that already has a user row.
 *
 *   npm run user:password -- staff@chipssquare.in
 *   npm run user:password -- staff@chipssquare.in --generate
 *   echo 'new-password' | npm run user:password -- staff@chipssquare.in --stdin
 *
 * There is no self-service signup or password reset: five people, one shop, and the person who
 * runs it is reachable. Adding an email flow here would mean an email vendor and a token table for
 * a problem nobody has.
 */

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function generatePassword(): string {
  // Base32-ish, no lookalike characters, easy to read out loud: 20 chars ≈ 100 bits.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();

  if (!email) {
    console.error("Usage: npm run user:password -- <email> [--generate] [--stdin]");
    process.exit(1);
  }

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    console.error(`✗ No user with email ${email}. Create the account first (seed or admin UI).`);
    process.exit(1);
  }

  let password: string;
  if (flags.has("--generate")) {
    password = generatePassword();
  } else if (flags.has("--stdin")) {
    password = await readStdin();
  } else {
    password = await prompt(`New password for ${email}: `);
    const confirm = await prompt("Repeat: ");
    if (password !== confirm) {
      console.error("✗ Passwords did not match.");
      process.exit(1);
    }
  }

  if (password.length < 8) {
    console.error("✗ Password must be at least 8 characters.");
    process.exit(1);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, row.id));

  console.log(`✓ Password set for ${email} (${row.role}).`);
  if (flags.has("--generate")) {
    console.log(`  Password: ${password}`);
    console.log("  Write it down now — only the hash is stored.");
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
