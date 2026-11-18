import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getStockRows } from "@/lib/inventory";
import { computeSellPrice, savingPaise, savingPercent, toNumber } from "@/lib/money";

/**
 * Read model for the storefront.
 *
 * Pages must never touch raw tables: they consume these DTOs, which already carry the derived
 * selling price, the saving, and live availability. One shape for the grid, the detail page and
 * (later) the admin list.
 */

export type ProductCardDto = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  sizeLabel: string | null;
  imagePath: string | null;
  description: string | null;
  mrpPaise: number;
  sellPaise: number;
  savingPaise: number;
  savingPct: number;
  /** Physically in the shop. */
  onHand: number;
  /** onHand minus open reservations. This is what can be reserved. */
  available: number;
};

type ProductRow = typeof products.$inferSelect;

function toDto(row: ProductRow, stock: { onHand: number; available: number }): ProductCardDto {
  const sellPaise = computeSellPrice({
    mrpPaise: row.mrpPaise,
    discountPct: row.discountPct,
    priceOverride: row.priceOverride,
    manualSellPricePaise: row.manualSellPricePaise,
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    sizeLabel: row.sizeLabel,
    imagePath: row.imagePath,
    description: row.description,
    mrpPaise: row.mrpPaise,
    sellPaise,
    savingPaise: savingPaise(row.mrpPaise, sellPaise),
    savingPct: savingPercent(row.mrpPaise, sellPaise),
    onHand: stock.onHand,
    available: stock.available,
  };
}

export type ListProductsOptions = {
  q?: string;
  category?: string;
  /** "discount" (default), "price-asc", "price-desc", "name" */
  sort?: string;
  limit?: number;
  inStockOnly?: boolean;
};

export async function listProducts(opts: ListProductsOptions = {}): Promise<ProductCardDto[]> {
  const conditions = [eq(products.isActive, true)];

  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(ilike(products.name, like), ilike(products.brand, like), ilike(products.category, like))!,
    );
  }
  if (opts.category) conditions.push(eq(products.category, opts.category));

  const orderBy =
    opts.sort === "price-asc"
      ? asc(products.mrpPaise)
      : opts.sort === "price-desc"
        ? desc(products.mrpPaise)
        : opts.sort === "name"
          ? asc(products.name)
          : desc(products.discountPct);

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(orderBy, asc(products.name))
    .limit(opts.limit ?? 200);

  if (rows.length === 0) return [];

  const stock = await getStockRows(
    db,
    rows.map((r) => r.id),
  );
  const stockById = new Map(stock.map((s) => [s.productId, s]));

  const dtos = rows.map((row) =>
    toDto(row, stockById.get(row.id) ?? { onHand: 0, available: 0 }),
  );

  return opts.inStockOnly ? dtos.filter((d) => d.available > 0) : dtos;
}

export async function getProductBySlug(slug: string): Promise<ProductCardDto | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);
  if (!row) return null;

  const [stock] = await getStockRows(db, [row.id]);
  return toDto(row, stock ?? { onHand: 0, available: 0 });
}

/** For "you may also like" on the product page. */
export async function relatedProducts(
  product: ProductCardDto,
  limit = 4,
): Promise<ProductCardDto[]> {
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        product.category ? eq(products.category, product.category) : isNull(products.brand),
        sql`${products.id} <> ${product.id}`,
      ),
    )
    .orderBy(desc(products.discountPct))
    .limit(limit);

  const stock = await getStockRows(
    db,
    rows.map((r) => r.id),
  );
  const stockById = new Map(stock.map((s) => [s.productId, s]));
  return rows.map((r) => toDto(r, stockById.get(r.id) ?? { onHand: 0, available: 0 }));
}

export type CategoryCount = { category: string; count: number };

export async function listCategories(): Promise<CategoryCount[]> {
  const rows = await db
    .select({
      category: products.category,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(products)
    .where(and(eq(products.isActive, true), sql`${products.category} is not null`))
    .groupBy(products.category)
    .orderBy(asc(products.category));

  return rows
    .filter((r): r is CategoryCount => r.category !== null)
    .map((r) => ({ category: r.category, count: toNumber(r.count) }));
}

/** Headline numbers for the home page trust strip. */
export async function catalogStats(): Promise<{ products: number; maxDiscount: number }> {
  const [row] = await db
    .select({
      products: sql<number>`count(*)`.mapWith(Number),
      maxDiscount: sql<number>`coalesce(max(${products.discountPct}), 0)`.mapWith(Number),
    })
    .from(products)
    .where(eq(products.isActive, true));

  return { products: row?.products ?? 0, maxDiscount: Math.round(row?.maxDiscount ?? 0) };
}
