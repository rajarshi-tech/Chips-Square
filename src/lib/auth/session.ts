import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signSessionToken, verifySessionToken } from "./token";

/**
 * Session handling tied to Next's cookie store and the database.
 *
 * `token.ts` holds the verifiable-token logic (pure, unit tested). This module only reads/writes
 * the cookie, resolves a token to a live user row, and exposes the guards every admin page and
 * server action must call.
 */

export const SESSION_COOKIE = "chipssq_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Role = "CUSTOMER" | "PARTNER" | "ADMIN" | "OWNER";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

/** Roles allowed into /admin. `PARTNER` can read money, so it is not a manager role. */
export const MANAGER_ROLES: Role[] = ["ADMIN", "OWNER"];

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV !== "production") {
    // Lets `npm run dev` work with zero setup. Never reached in production, and loud in .env.example.
    return "dev-only-insecure-secret-never-use-this-in-production";
  }
  throw new Error(
    "AUTH_SECRET is missing or shorter than 32 characters. Set it in .env.local — see .env.example.",
  );
}

/** The signed-in user, or null. A stale or forged cookie is simply "no session", never an error. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(token, getAuthSecret());
  if (!payload) return null;
  return getUserById(payload.sub);
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

/** Issue the cookie. Call only from a Server Action or Route Handler. */
export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    signSessionToken({ sub: userId, exp: Date.now() + SESSION_TTL_MS }, getAuthSecret()),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  );
}

/** Clear the cookie. Call only from a Server Action or Route Handler. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** For pages and actions that need a signed-in user. Redirects to /login when there is none. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Owner-only actions: creating accounts, changing roles, revocation. Admins keep the shop running;
 * an owner decides who else can.
 */
export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/admin");
  return user;
}

/**
 * For pages and actions that need a manager. Returns 404-ish behaviour via redirect rather than
 * revealing that an admin area exists to a signed-in customer.
 */
export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!MANAGER_ROLES.includes(user.role)) redirect("/");
  return user;
}
