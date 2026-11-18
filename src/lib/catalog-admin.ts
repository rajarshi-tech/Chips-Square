import { and, asc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockLevels } from "@/db/schema";
import { slugify, uniqueSlug } from "@/lib/codes";
import { refreshStockLevel } from "@/lib/inventory";
import { computeSellPrice, rupeesToPaise, toNumber } from "@/lib/money";

/**
 * Writes to the catalog, kept out of the server actions so they can be exercised without a browser.
 *
 * Two rules live here:
 *   1. A slug is generated once and then frozen — changing a product's name must not break links
 *      people have shared.
 *   2. Products are archived, never deleted. Stock history and sale items point at them.
 */

export class DuplicateProductError extends Error {
  constructor(readonly matched: string) {
    super("A product with this brand, name and size already exists");
    this.name = "DuplicateProductError";
  }
}

export type ProductInput = {
  name: string;
  brand: string | null;
  category: string | null;
  sizeLabel: string | null;
  barcode: string | null;
  mrpRupees: string | number;
  discountPct: string | number;
  lowStockThreshold: number | null;
  description: string | null;
};

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  sizeLabel: string | null;
  barcode: string | null;
  description: string | null;
  mrpPaise: number;
  sellPaise: number;
  discountPct: string;
  onHand: number;
  onHandValuePaise: number;
  isActive: boolean;
  lowStockThreshold: number | null;
};

/** Postgres unique violation. Drizzle wraps it, so the SQLSTATE can be one or two levels down. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function listAdminProducts(opts: {
  q?: string;
  status?: "all" | "active" | "archived" | "low" | "out";
  limit?: number;
}): Promise<AdminProductRow[]> {
  const conditions = [];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(products.name, like),
        ilike(products.brand, like),
        ilike(products.category, like),
        eq(products.barcode, q),
      ),
    );
  }

  const rows = await db
    .select({
      product: products,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
      avgCostPaise: sql<number>`coalesce(${stockLevels.avgCostPaise}, 0)::int`,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(products.name))
    .limit(opts.limit ?? 300);

  const mapped = rows.map(({ product, onHand, avgCostPaise }) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    sizeLabel: product.sizeLabel,
    barcode: product.barcode,
    description: product.description,
    mrpPaise: product.mrpPaise,
    sellPaise: computeSellPrice({
      mrpPaise: product.mrpPaise,
      discountPct: product.discountPct,
      priceOverride: product.priceOverride,
      manualSellPricePaise: product.manualSellPricePaise,
    }),
    discountPct: product.discountPct,
    onHand,
    onHandValuePaise: onHand * avgCostPaise,
    isActive: product.isActive,
    lowStockThreshold: product.lowStockThreshold,
  }));

  switch (opts.status) {
    case "active":
      return mapped.filter((r) => r.isActive);
    case "archived":
      return mapped.filter((r) => !r.isActive);
    case "low":
      return mapped.filter((r) => r.lowStockThreshold !== null && r.onHand <= r.lowStockThreshold);
    case "out":
      return mapped.filter((r) => r.onHand <= 0);
    default:
      return mapped;
  }
}

export async function createProduct(input: ProductInput): Promise<{ id: string; slug: string }> {
  const taken = await db
    .select({ slug: products.slug })
    .from(products)
    .where(ilike(products.slug, `${slugify(productSlugBase(input))}%`));

  const slug = uniqueSlug(productSlugBase(input), taken.map((t) => t.slug));

  let inserted: { id: string; slug: string };
  try {
    [inserted] = await db
      .insert(products)
      .values({
        slug,
        name: input.name,
        brand: input.brand,
        category: input.category,
        sizeLabel: input.sizeLabel,
        barcode: input.barcode,
        mrpPaise: rupeesToPaise(input.mrpRupees),
        discountPct: toNumber(input.discountPct).toFixed(2),
        lowStockThreshold: input.lowStockThreshold,
        description: input.description,
      })
      .returning({ id: products.id, slug: products.slug });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateProductError(`${input.brand ?? ""} ${input.name}`.trim());
    }
    throw err;
  }

  // A zero row so lists and the settlement join see this product immediately.
  await refreshStockLevel(db, inserted.id);
  return inserted;
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<{ id: string; slug: string }> {
  try {
    const [updated] = await db
      .update(products)
      .set({
        name: input.name,
        brand: input.brand,
        category: input.category,
        sizeLabel: input.sizeLabel,
        barcode: input.barcode,
        mrpPaise: rupeesToPaise(input.mrpRupees),
        discountPct: toNumber(input.discountPct).toFixed(2),
        lowStockThreshold: input.lowStockThreshold,
        description: input.description,
        updatedAt: new Date(),
      })
      // The slug is deliberately not updated: links stay valid after a rename.
      .where(eq(products.id, id))
      .returning({ id: products.id, slug: products.slug });
    if (!updated) throw new Error("Product not found");
    return updated;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateProductError(`${input.brand ?? ""} ${input.name}`.trim());
    }
    throw err;
  }
}

export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  await db.update(products).set({ isActive, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function getAdminProduct(id: string): Promise<AdminProductRow | null> {
  const rows = await db
    .select({
      product: products,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
      avgCostPaise: sql<number>`coalesce(${stockLevels.avgCostPaise}, 0)::int`,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(eq(products.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const { product, onHand, avgCostPaise } = row;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    category: product.category,
    sizeLabel: product.sizeLabel,
    barcode: product.barcode,
    description: product.description,
    mrpPaise: product.mrpPaise,
    sellPaise: computeSellPrice({
      mrpPaise: product.mrpPaise,
      discountPct: product.discountPct,
      priceOverride: product.priceOverride,
      manualSellPricePaise: product.manualSellPricePaise,
    }),
    discountPct: product.discountPct,
    onHand,
    onHandValuePaise: onHand * avgCostPaise,
    isActive: product.isActive,
    lowStockThreshold: product.lowStockThreshold,
  };
}

/** Categories already in use, for the datalist on the form. */
export async function listCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(ne(products.category, ""))
    .orderBy(asc(products.category));
  return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
}

function productSlugBase(input: Pick<ProductInput, "name" | "sizeLabel">): string {
  return input.sizeLabel ? `${input.name} ${input.sizeLabel}` : input.name;
}
