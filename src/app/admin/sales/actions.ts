"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager } from "@/lib/auth/session";
import { createSale, SaleError, voidSale } from "@/lib/sales";

export type SaleFormState = { error: string | null };

const LineSchema = z.object({
  productId: z.string().min(1),
  qty: z.coerce.number().int("Quantities are whole numbers").positive("Quantity must be more than 0"),
  unitPricePaise: z.coerce.number().int().min(0).optional().nullable(),
});

const SaleSchema = z.object({
  lines: z.string().min(2, "Add at least one product"),
  method: z.enum(["CASH", "UPI", "BANK_TRANSFER"]),
  buyerName: z
    .string()
    .trim()
    .max(60)
    .transform((v) => (v === "" ? null : v)),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v)),
});

export async function createSaleAction(
  _prev: SaleFormState,
  formData: FormData,
): Promise<SaleFormState> {
  const user = await requireManager();

  const parsed = SaleSchema.safeParse({
    lines: formData.get("lines") ?? "",
    method: formData.get("method") ?? "CASH",
    buyerName: formData.get("buyerName") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the sale" };
  }

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(parsed.data.lines);
  } catch {
    return { error: "Could not read the sale lines. Reload and try again." };
  }

  const lines = z.array(LineSchema).min(1).safeParse(rawLines);
  if (!lines.success) {
    return { error: lines.error.issues[0]?.message ?? "Check the quantities" };
  }

  let created: { code: string };
  try {
    created = await createSale({
      lines: lines.data,
      method: parsed.data.method,
      buyerName: parsed.data.buyerName,
      note: parsed.data.note,
      actorId: user.id,
    });
  } catch (err) {
    if (err instanceof SaleError) return { error: err.message };
    throw err;
  }

  revalidatePath("/admin/sales");
  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath("/");
  redirect(`/admin/sales?recorded=${created.code}`);
}

/** Void, never delete: the items come back to the shelf and the sale keeps its place in history. */
export async function voidSaleAction(formData: FormData): Promise<void> {
  const user = await requireManager();
  const saleId = String(formData.get("saleId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!saleId || !reason) return;

  await voidSale({ saleId, reason, actorId: user.id });

  revalidatePath("/admin/sales");
  revalidatePath("/admin/stock");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath("/");
}