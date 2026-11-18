/**
 * Open Food Facts barcode lookup — the barcode on the pack is the fastest way to fill in a form for
 * a snack nobody wants to type. Free, no key, ODbL licensed (attribution is in the site footer).
 *
 * Used to *prefill* a form, never as the source of truth: OFF is crowd-sourced, so name, brand and
 * quantity are suggestions the admin confirms. No images are copied from it — see docs/03.
 */

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT_MS = 6_000;

export type BarcodeLookup =
  | { ok: true; barcode: string; name: string; brand: string | null; size: string | null }
  | { ok: false; barcode: string; error: string };

type OffResponse = {
  status?: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    brands?: string;
    quantity?: string;
  };
};

export function isValidBarcode(input: string): boolean {
  return /^\d{8,14}$/.test(input.trim());
}

export async function lookupBarcode(rawBarcode: string): Promise<BarcodeLookup> {
  const barcode = rawBarcode.trim();
  if (!isValidBarcode(barcode)) {
    return { ok: false, barcode, error: "A barcode is 8–14 digits." };
  }

  const url = `${ENDPOINT}/${barcode}.json?fields=product_name,product_name_en,brands,quantity`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // OFF asks every client to identify itself.
        "User-Agent": "ChipsSquare/0.1 (inventory app; contact via site)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return { ok: false, barcode, error: "Could not reach Open Food Facts." };
    }

    const data = (await res.json()) as OffResponse;
    const name = data.product?.product_name?.trim() || data.product?.product_name_en?.trim();
    if (!data.product || !name) {
      return { ok: false, barcode, error: "Not found. Type the name in by hand." };
    }

    return {
      ok: true,
      barcode,
      name,
      brand: data.product.brands?.split(",")[0]?.trim() || null,
      size: data.product.quantity?.trim() || null,
    };
  } catch {
    return { ok: false, barcode, error: "Lookup timed out. Type the name in by hand." };
  } finally {
    clearTimeout(timer);
  }
}
