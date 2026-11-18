/**
 * Account management from a terminal — the escape hatch for the first account, and for when nobody
 * can sign in.
 *
 *   npm run user:create   -- you@example.com --role OWNER --generate
 *   npm run user:create   -- priya@example.com --role ADMIN --name Priya
 *   npm run user:password -- you@example.com
 *   npm run user:password -- you@example.com --generate
 *
 * `create` is how the very first owner comes into existence: /admin/users needs an owner to open,
 * so there has to be a way in from outside the browser.
 *
 * Everything here also exists in /admin/users. This script is for setup and lockouts, not the daily
 * path.
 */

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createUser, EmailTakenError, setUserPassword } from "../src/lib/users-admin";

const ROLES = ["OWNER", "ADMIN"] as const;
type Role = (typeof ROLES)[number];

function flag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

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
  // No lookalike characters: this gets read out loud or typed on a phone.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/** Explicit password > --generate > --stdin > interactive prompt. */
async function resolvePassword(args: string[], email: string, allowBlank: boolean) {
  const explicit = flag(args, "--password");
  if (explicit) return { password: explicit, generated: false };

  if (args.includes("--generate")) return { password: generatePassword(), generated: true };

  if (args.includes("--stdin")) return { password: await readStdin(), generated: false };

  if (allowBlank) {
    const answer = await prompt(`Password for ${email} (blank = generate one): `);
    if (!answer) return { password: generatePassword(), generated: true };
    return { password: answer, generated: false };
  }

  const password = await prompt(`New password for ${email}: `);
  const confirm = await prompt("Repeat: ");
  if (password !== confirm) throw new Error("Passwords did not match");
  return { password, generated: false };
}

async function commandCreate(args: string[]) {
  const email = args.find((a) => !a.startsWith("--") && a.includes("@"))?.trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: npm run user:create -- <email> [--role OWNER] [--name Name] [--generate]");
  }

  const roleRaw = (flag(args, "--role") ?? "ADMIN").toUpperCase();
  if (!ROLES.includes(roleRaw as Role)) {
    throw new Error(`Role must be one of ${ROLES.join(", ")}`);
  }
  const role = roleRaw as Role;
  const name = flag(args, "--name");

  const { password, generated } = await resolvePassword(args, email, true);
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  try {
    const created = await createUser({ email, name, role, password });
    console.log(`✓ Created ${created.email} as ${created.role}`);
  } catch (err) {
    if (err instanceof EmailTakenError) {
      throw new Error(`${email} already exists. Change its password with: npm run user:password -- ${email}`);
    }
    throw err;
  }

  if (generated) {
    console.log(`  Password: ${password}`);
    console.log("  Shown once — only the hash is stored. Sign in at /login.");
  }
}

async function commandPassword(args: string[]) {
  const email = args.find((a) => !a.startsWith("--") && a.includes("@"))?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run user:password -- <email> [--generate]");

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    throw new Error(`No user with email ${email}. Create one: npm run user:create -- ${email} --role OWNER`);
  }

  const { password, generated } = await resolvePassword(args, email, false);
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  // Same guard as the UI: the last owner must stay able to sign in.
  await setUserPassword(row.id, password);
  console.log(`✓ Password set for ${email} (${row.role})`);
  if (generated) {
    console.log(`  Password: ${password}`);
    console.log("  Shown once — only the hash is stored.");
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "create":
      return commandCreate(args);
    case "password":
      return commandPassword(args);
    default:
      console.log("Commands:");
      console.log("  npm run user:create   -- <email> [--role OWNER] [--name Name] [--generate]");
      console.log("  npm run user:password -- <email> [--generate] [--stdin]");
      process.exit(command ? 1 : 0);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗", err instanceof Error ? err.message : err);
    process.exit(1);
  });
