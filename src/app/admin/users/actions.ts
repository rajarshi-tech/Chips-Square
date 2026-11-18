"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import {
  createUser,
  EmailTakenError,
  generatePassword,
  LastOwnerError,
  setUserPassword,
  setUserRole,
} from "@/lib/users-admin";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Owner-only account management. Every action re-checks the role: a layout guard protects pages,
 * not actions.
 */

export type UserFormState = { error: string | null; created?: { email: string; password: string } };

const RoleSchema = z.enum(["ADMIN", "PARTNER", "OWNER", "CUSTOMER"]);

const CreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  name: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v)),
  role: RoleSchema,
  password: z.string().trim().optional(),
});

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  await requireOwner();

  const parsed = CreateSchema.safeParse({
    email: formData.get("email") ?? "",
    name: formData.get("name") ?? "",
    role: formData.get("role") ?? "ADMIN",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  const password = parsed.data.password && parsed.data.password.length >= 8
    ? parsed.data.password
    : generatePassword();

  try {
    const created = await createUser({
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      password,
    });
    revalidatePath("/admin/users");
    // Shown once. There is no email to send it to.
    return { error: null, created: { email: created.email, password } };
  } catch (err) {
    if (err instanceof EmailTakenError) return { error: err.message };
    throw err;
  }
}

export async function setRoleAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const parsed = RoleSchema.safeParse(formData.get("role"));
  if (!id || !parsed.success) return;

  // Guard against locking everyone out by demoting the last owner — including yourself.
  try {
    await setUserRole(id, parsed.data);
  } catch (err) {
    if (err instanceof LastOwnerError) {
      // Nothing to show on a plain form post; the list re-renders unchanged.
      return;
    }
    throw err;
  }
  if (id === actor.id) revalidatePath("/admin");
  revalidatePath("/admin/users");
}

export type PasswordState = { error: string | null; reset?: { email: string; password: string } };

export async function resetPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  const typed = String(formData.get("password") ?? "").trim();
  if (!id) return { error: "Missing user" };

  const [row] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) return { error: "That account no longer exists" };

  if (typed.length > 0 && typed.length < 8) {
    return { error: "Use at least 8 characters" };
  }

  // A generated password shown once is fine to hand to someone else, never to yourself.
  if (id === actor.id && typed.length === 0) {
    return { error: "Choose your own password here — you cannot take a random one for yourself." };
  }

  const password = typed.length >= 8 ? typed : generatePassword();

  try {
    await setUserPassword(id, password);
  } catch (err) {
    if (err instanceof LastOwnerError) return { error: err.message };
    throw err;
  }

  revalidatePath("/admin/users");
  return { error: null, reset: { email: row.email, password } };
}

/** Revoke = clear the password hash. The row stays so historical records keep resolving. */
export async function revokeAccessAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id || id === actor.id) return; // never revoke yourself by accident

  try {
    await setUserPassword(id, null);
  } catch (err) {
    if (err instanceof LastOwnerError) return;
    throw err;
  }
  revalidatePath("/admin/users");
}
