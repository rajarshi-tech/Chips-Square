import { randomBytes } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/session";

/**
 * Account management. Only an OWNER reaches these functions (enforced by the actions that call
 * them), because "who can change the numbers" is the one decision a club should not delegate.
 *
 * Two ways to remove someone:
 *   Revoke  clears `password_hash`. The row stays, so `created_by` / `voided_by` still resolve.
 *   Delete  removes the row. Sales and movements keep their `created_by` uuid but can no longer show
 *           a name — that is the trade, and the UI says so before it happens.
 *
 * `LastOwnerError` guards both: the business must always have one owner who can sign in and manage
 * accounts.
 *
 * Vocabulary (two roles, deliberately):
 *   OWNER  one person: the site owner. Everything an admin can do, plus accounts and settlements.
 *   ADMIN  everyone else in the business. Products, stock, sales, purchases, dashboard.
 *
 * There is no customer or partner login. Five people share the work; the shop itself is public.
 */

/** Postgres unique violation; Drizzle wraps it, so the SQLSTATE may sit in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export class EmailTakenError extends Error {
  constructor(readonly email: string) {
    super(`An account already exists for ${email}`);
    this.name = "EmailTakenError";
  }
}

export class LastOwnerError extends Error {
  constructor() {
    super("There must always be at least one owner with a password");
    this.name = "LastOwnerError";
  }
}

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: Role;
  canSignIn: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "OWNER"];

/** Readable, unambiguous, ~100 bits. Shown once, never stored. */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      passwordHash: users.passwordHash,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.email));

  return rows.map(({ passwordHash, ...rest }) => ({ ...rest, canSignIn: passwordHash !== null }));
}

export async function createUser(input: {
  email: string;
  name: string | null;
  role: Role;
  password?: string;
}): Promise<{ id: string; email: string; role: Role; password: string | null }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password?.trim() ? input.password : generatePassword();

  let inserted: { id: string; email: string; role: Role };
  try {
    [inserted] = await db
      .insert(users)
      .values({
        email,
        name: input.name,
        role: input.role,
        passwordHash: await hashPassword(password),
      })
      .returning({ id: users.id, email: users.email, role: users.role });
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailTakenError(email);
    throw err;
  }

  return { ...inserted, password };
}

export async function setUserPassword(
  id: string,
  password: string | null,
): Promise<{ password: string | null }> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new Error("User not found");

  if (password === null) {
    if (row.role === "OWNER") await assertAnotherOwnerRemains(id);
    await db
      .update(users)
      .set({ passwordHash: null, updatedAt: new Date() })
      .where(eq(users.id, id));
    return { password: null };
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, id));
  return { password };
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new Error("User not found");

  // Demoting the only owner would lock everyone out of account management for good.
  if (row.role === "OWNER" && role !== "OWNER") await assertAnotherOwnerRemains(id);

  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
}

/**
 * Permanently remove an account. Owner-only, and never the last owner.
 *
 * Foreign keys are `set null` (partners, feedback) or absent (created_by columns), so history keeps
 * its rows and loses only the name attached to them.
 */
export async function deleteUser(id: string, actorId: string): Promise<void> {
  if (id === actorId) throw new LastOwnerError(); // deleting yourself locks you out mid-session

  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new Error("User not found");
  if (row.role === "OWNER") await assertAnotherOwnerRemains(id);

  await db.delete(users).where(eq(users.id, id));
}

async function assertAnotherOwnerRemains(excludingId: string): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(
      sql`${users.role} = 'OWNER' and ${users.passwordHash} is not null and ${users.id} <> ${excludingId}`,
    );
  if ((row?.count ?? 0) === 0) throw new LastOwnerError();
}
