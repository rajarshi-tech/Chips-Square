"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/auth/session";
import { clearFailures, isThrottled, noteFailure } from "@/lib/auth/throttle";

export type LoginState = { error: string | null };

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
});

/** Same message for every failure mode, so the form never reveals which emails exist. */
const GENERIC_ERROR = "That email and password do not match an account.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }

  const { email, password } = parsed.data;
  const key = `${email}|${await clientIp()}`;

  if (isThrottled(key)) {
    return { error: "Too many attempts. Wait 15 minutes and try again." };
  }

  const [row] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Verify against a dummy hash when the account is unknown or has no password yet, so the
  // response takes the same time either way.
  const ok = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);

  if (!row || !ok || !row.passwordHash) {
    noteFailure(key);
    return { error: GENERIC_ERROR };
  }

  clearFailures(key);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
  await startSession(row.id);

  // Must be outside any try/catch: redirect signals by throwing.
  redirect("/admin");
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headerList.get("x-real-ip") ?? "local";
}
