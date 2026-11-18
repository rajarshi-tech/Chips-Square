import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockLevels } from "@/db/schema";
import { computeSellPrice } from "@/lib/money";

/**
 * The counter form's product finder. Only sellable things: active, and actually on the shelf.
 * Deliberately tiny — a phone at the counter should not download the whole catalogue to sell one
 * packet of chips.
 */
export async function searchSellableProducts(query: string, limit = 12) {
  const q = query.trim();
  const conditions = [
    eq(products.isActive, true),
    sql`coalesce(${stockLevels.onHand}, 0) > 0`,
  ];

  if (q) {
    const like = `%${q}%`;
    const match = or(
      ilike(products.name, like),
      ilike(products.brand, like),
      ilike(products.category, like),
      eq(products.barcode, q),
    );
    if (match) conditions.push(match);
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: products.brand,
      sizeLabel: products.sizeLabel,
      mrpPaise: products.mrpPaise,
      discountPct: products.discountPct,
      priceOverride: products.priceOverride,
      manualSellPricePaise: products.manualSellPricePaise,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    sizeLabel: r.sizeLabel,
    onHand: r.onHand,
    sellPaise: computeSellPrice({
      mrpPaise: r.mrpPaise,
      discountPct: r.discountPct,
      priceOverride: r.priceOverride,
      manualSellPricePaise: r.manualSellPricePaise,
    }),
  }));
}