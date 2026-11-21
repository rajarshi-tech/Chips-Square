"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager, requireOwner } from "@/lib/auth/session";
import {
  createCycle,
  finaliseSettlement,
  markSharePaid,
  SettlementError,
} from "@/lib/settle";

export type CycleFormState = { error: string | null };

const CycleSchema = z.object({
  name: z.string().trim().min(1, "Give the cycle a name").max(60),
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
});

export async function createCycleAction(
  _prev: CycleFormState,
  formData: FormData,
): Promise<CycleFormState> {
  await requireManager();

  const parsed = CycleSchema.safeParse({
    name: formData.get("name") ?? "",
    openedAt: formData.get("openedAt") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  let created: { id: string };
  try {
    created = await createCycle(parsed.data);
  } catch (err) {
    if (err instanceof SettlementError) return { error: err.message };
    throw err;
  }

  revalidatePath("/admin/cycles");
  redirect(`/admin/cycles/${created.id}`);
}

/**
 * Freeze the split. Owner-only: an admin runs the shop, but who gets paid is the owner's call.
 * Errors travel back in the URL because this is a plain form post with nothing to render a message in.
 */
export async function finaliseCycleAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const cycleId = String(formData.get("cycleId") ?? "");
  if (!cycleId) return;

  try {
    await finaliseSettlement({ cycleId, actorId: actor.id });
  } catch (err) {
    if (err instanceof SettlementError) {
      redirect(`/admin/cycles/${cycleId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  revalidatePath("/admin/cycles");
  revalidatePath(`/admin/cycles/${cycleId}`);
  redirect(`/admin/cycles/${cycleId}?settled=1`);
}

export async function markSharePaidAction(formData: FormData): Promise<void> {
  await requireOwner();
  const shareId = String(formData.get("shareId") ?? "");
  const cycleId = String(formData.get("cycleId") ?? "");
  if (!shareId) return;

  await markSharePaid(shareId);

  revalidatePath("/admin/cycles");
  if (cycleId) revalidatePath(`/admin/cycles/${cycleId}`);
}
