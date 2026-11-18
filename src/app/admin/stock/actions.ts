"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/auth/session";
import { adjustStock, NotEnoughStockError, recalcStockLevel } from "@/lib/stock-admin";
import { ADJUST_KINDS, StockRuleError, type AdjustKind } from "@/lib/stock-rules";

export type AdjustState = {
  error: string | null;
  done?: { kind: AdjustKind; qtyDelta: number; onHand: number };
};

const FormSchema = z.object({
  productId: z.string().min(1),
  kind: z.enum(ADJUST_KINDS),
  qty: z.coerce.number().int("Use whole numbers"),
  costRupees: z.string().trim().optional(),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
});

/** The only way units move on this screen. Every branch news up a ledger movement. */
export async function adjustStockAction(
  _prev: AdjustState,
  formData: FormData,
): Promise<AdjustState> {
  const user = await requireManager();

  const parsed = FormSchema.safeParse({
    productId: formData.get("productId") ?? "",
    kind: formData.get("kind") ?? "",
    qty: formData.get("qty") ?? "",
    costRupees: formData.get("costRupees") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }

  try {
    const result = await adjustStock({
      productId: parsed.data.productId,
      kind: parsed.data.kind,
      qty: parsed.data.qty,
      costRupees: parsed.data.costRupees || null,
      note: parsed.data.note,
      actorId: user.id,
    });

    revalidatePath("/admin/stock");
    revalidatePath(`/admin/stock/${parsed.data.productId}`);
    revalidatePath("/admin");
    revalidatePath("/catalog");
    revalidatePath("/");

    return {
      error: null,
      done: { kind: parsed.data.kind, qtyDelta: result.qtyDelta, onHand: result.onHand },
    };
  } catch (err) {
    if (err instanceof NotEnoughStockError || err instanceof StockRuleError) {
      return { error: err.message };
    }
    throw err;
  }
}

/** Rebuild the cached level from the ledger when a number looks wrong. */
export async function recalcStockAction(formData: FormData): Promise<void> {
  await requireManager();
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;

  await recalcStockLevel(productId);
  revalidatePath("/admin/stock");
  revalidatePath(`/admin/stock/${productId}`);
  revalidatePath("/admin");
  revalidatePath("/catalog");
}
