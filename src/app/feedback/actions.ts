"use server";

import { z } from "zod";
import { db } from "@/db";
import { feedback } from "@/db/schema";

/**
 * Feedback / item-request intake.
 *
 * Phase 4 will add Cloudflare Turnstile and per-IP rate limiting (see docs/04-roadmap.md).
 * Until then: a honeypot field, hard length caps, and a strict type whitelist — which is enough
 * to keep a low-traffic form clean.
 */

const schema = z.object({
  type: z.enum(["SUGGESTION", "ITEM_REQUEST", "BUG", "COMPLAINT"]),
  body: z
    .string()
    .trim()
    .min(3, "Tell us a little more than that.")
    .max(1000, "Please keep it under 1000 characters."),
  requestedItem: z.string().trim().max(120).optional(),
  name: z.string().trim().max(80).optional(),
  contact: z.string().trim().max(120).optional(),
});

export type FeedbackState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  // Honeypot: a real person never fills this hidden field.
  if (String(formData.get("website") ?? "").length > 0) {
    return { status: "ok", message: "Thanks — we have it." };
  }

  const parsed = schema.safeParse({
    type: formData.get("type") ?? "SUGGESTION",
    body: formData.get("body") ?? "",
    requestedItem: emptyToUndefined(formData.get("requestedItem")),
    name: emptyToUndefined(formData.get("name")),
    contact: emptyToUndefined(formData.get("contact")),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
    }
    return { status: "error", message: "Please check the highlighted field.", fieldErrors };
  }

  const data = parsed.data;

  try {
    await db.insert(feedback).values({
      type: data.type,
      body: data.body,
      requestedItem: data.type === "ITEM_REQUEST" ? (data.requestedItem ?? data.body) : null,
      name: data.name ?? null,
      contact: data.contact ?? null,
      status: "NEW",
    });
  } catch {
    return {
      status: "error",
      message: "Could not save that just now. Please try again in a moment.",
    };
  }

  return {
    status: "ok",
    message:
      data.type === "ITEM_REQUEST"
        ? "Noted — we will look at this for the next bulk order."
        : "Thanks, we read every one of these.",
  };
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > 0 ? s : undefined;
}
