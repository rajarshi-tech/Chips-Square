import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockLevels } from "@/db/schema";
import { computeSellPrice } from "@/lib/money";

/**
 * The counter's shelf: every active product that is actually in stock, with the price to charge.
 *
 * The counter form shows these as tiles you tap, so it loads the whole list once instead of
 * searching on every keystroke. A few hundred rows of five short fields is a small payload
 * (~40 KB), and one round trip beats one per letter on a phone at the counter. Anything with
 * nothing on the shelf is left out: you cannot sell what is not there.
 */

export type SellableProduct = {
  id: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  barcode: string | null;
  onHand: number;
  sellPaise: number;
};

export async function listSellableProducts(limit = 500): Promise<SellableProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      sizeLabel: products.sizeLabel,
      barcode: products.barcode,
      mrpPaise: products.mrpPaise,
      discountPct: products.discountPct,
      priceOverride: products.priceOverride,
      manualSellPricePaise: products.manualSellPricePaise,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(and(eq(products.isActive, true), sql`coalesce(${stockLevels.onHand}, 0) > 0`))
    .orderBy(products.name)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    sizeLabel: r.sizeLabel,
    barcode: r.barcode,
    onHand: r.onHand,
    sellPaise: computeSellPrice({
      mrpPaise: r.mrpPaise,
      discountPct: r.discountPct,
      priceOverride: r.priceOverride,
      manualSellPricePaise: r.manualSellPricePaise,
    }),
  }));
}
