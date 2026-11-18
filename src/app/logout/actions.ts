"use server";

import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth/session";

/**
 * Sign out. A Server Action, so it only runs from an explicit form submission — a GET link that
 * clears the session would let any page log you out with an image tag.
 */
export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}
