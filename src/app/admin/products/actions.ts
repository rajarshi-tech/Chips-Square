"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireManager } from "@/lib/auth/session";
import {
  createProduct,
  DuplicateProductError,
  setProductActive,
  updateProduct,
  type ProductInput,
} from "@/lib/catalog-admin";
import { lookupBarcode } from "@/lib/openfoodfacts";

export type ProductFormState = { error: string | null };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const ProductSchema = z.object({
  name: z.string().trim().min(1, "A product needs a name").max(120),
  brand: optionalText(60),
  category: optionalText(40),
  sizeLabel: optionalText(30),
  barcode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{8,14}$/.test(v), "A barcode is 8–14 digits"),
  mrpRupees: z.coerce.number().positive("MRP must be more than zero").max(100_000),
  discountPct: z.coerce.number().min(0, "Discount cannot be negative").max(90, "Keep it under 90%"),
  lowStockThreshold: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Use a whole number"),
  description: optionalText(500),
});

function parseForm(formData: FormData): { ok: true; input: ProductInput } | { ok: false; error: string } {
  const parsed = ProductSchema.safeParse({
    name: formData.get("name") ?? "",
    brand: formData.get("brand") ?? "",
    category: formData.get("category") ?? "",
    sizeLabel: formData.get("sizeLabel") ?? "",
    barcode: formData.get("barcode") ?? "",
    mrpRupees: formData.get("mrpRupees") ?? "",
    discountPct: formData.get("discountPct") ?? "0",
    lowStockThreshold: formData.get("lowStockThreshold") ?? "",
    description: formData.get("description") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  return { ok: true, input: parsed.data };
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireManager();
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  let created: { id: string; slug: string };
  try {
    created = await createProduct(parsed.input);
  } catch (err) {
    if (err instanceof DuplicateProductError) {
      return { error: `${err.message}. Edit the existing one instead.` };
    }
    throw err;
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  redirect(`/admin/products/${created.id}?created=1`);
}

export async function updateProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing product id" };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await updateProduct(id, parsed.input);
  } catch (err) {
    if (err instanceof DuplicateProductError) {
      return { error: `${err.message}. Merge them instead of creating a second one.` };
    }
    throw err;
  }

  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
  redirect(`/admin/products/${id}?saved=1`);
}

/** Archive/restore. Archive hides it from the shop; the row and its history stay. */
export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("nextActive") === "true";
  if (!id) return;

  await setProductActive(id, next);
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  revalidatePath("/");
}

export type BarcodeLookupState =
  | { status: "idle" }
  | { status: "found"; name: string; brand: string | null; size: string | null }
  | { status: "error"; message: string };

export async function lookupBarcodeAction(barcode: string): Promise<BarcodeLookupState> {
  await requireManager();
  const result = await lookupBarcode(barcode);
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "found", name: result.name, brand: result.brand, size: result.size };
}
