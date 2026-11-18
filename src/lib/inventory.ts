import { eq, inArray, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { products, stockLevels, stockMovements } from "@/db/schema";

/**
 * Inventory rules. `stock_movements` is the source of truth; `stock_levels` is a cache of its SUM.
 *
 * Since there are no reservations, on-hand IS what the customer sees. Nothing is held back, so
 * there is no second "available" number to keep in sync.
 *
 * Every function takes an `Executor` so it can run inside or outside a transaction.
 */

export type Executor = Pick<Database, "insert" | "select" | "update" | "delete" | "execute">;

export type MovementInput = {
  productId: string;
  type: (typeof stockMovements.$inferInsert)["type"];
  /** Signed. Positive = into stock, negative = out. */
  qtyDelta: number;
  unitCostPaise?: number | null;
  purchaseId?: string | null;
  saleId?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

const NOTE_REQUIRED = new Set(["DAMAGE", "EXPIRY", "SELF_USE", "ADJUSTMENT"]);

/**
 * Append one movement and refresh the cached level for that product.
 * Refuses movements that would hide their reason or their cost.
 */
export async function recordMovement(exec: Executor, input: MovementInput): Promise<void> {
  if (!Number.isInteger(input.qtyDelta) || input.qtyDelta === 0) {
    throw new Error("qtyDelta must be a non-zero integer");
  }
  if (NOTE_REQUIRED.has(input.type) && !input.note?.trim()) {
    throw new Error(`A note is required for ${input.type} movements`);
  }
  if ((input.type === "PURCHASE" || input.type === "SALE") && input.unitCostPaise == null) {
    throw new Error(`unitCostPaise is required for ${input.type} movements (COGS snapshot)`);
  }

  await exec.insert(stockMovements).values({
    productId: input.productId,
    type: input.type,
    qtyDelta: input.qtyDelta,
    unitCostPaise: input.unitCostPaise ?? null,
    purchaseId: input.purchaseId ?? null,
    saleId: input.saleId ?? null,
    note: input.note ?? null,
    createdBy: input.createdBy ?? null,
  });

  await refreshStockLevel(exec, input.productId);
}

/**
 * Recompute `stock_levels` from the ledger. Cheap (two aggregates over one product) and always
 * correct — which is why it is safe to call after every movement.
 *
 * Average cost is driven by inbound PURCHASE movements only, so a written-off unit does not
 * distort the cost of the units still on the shelf.
 */
export async function refreshStockLevel(exec: Executor, productId: string): Promise<void> {
  const [totals] = await exec
    .select({
      onHand: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)`.mapWith(Number),
      purchasedQty:
        sql<number>`coalesce(sum(case when ${stockMovements.type} = 'PURCHASE' then ${stockMovements.qtyDelta} else 0 end), 0)`.mapWith(
          Number,
        ),
      purchasedCost:
        sql<number>`coalesce(sum(case when ${stockMovements.type} = 'PURCHASE' then ${stockMovements.qtyDelta} * coalesce(${stockMovements.unitCostPaise}, 0) else 0 end), 0)`.mapWith(
          Number,
        ),
      lastAt: sql<string | null>`max(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));

  const avgCostPaise =
    totals && totals.purchasedQty > 0 ? Math.round(totals.purchasedCost / totals.purchasedQty) : 0;

  const values = {
    productId,
    onHand: totals?.onHand ?? 0,
    avgCostPaise,
    lastMovementAt: totals?.lastAt ? new Date(totals.lastAt) : null,
  };

  await exec
    .insert(stockLevels)
    .values(values)
    .onConflictDoUpdate({ target: stockLevels.productId, set: values });
}

export type StockLevel = {
  productId: string;
  /** Physically on the shelf. This is what the public sees. */
  onHand: number;
  /** Weighted average purchase cost per unit, in paise. */
  avgCostPaise: number;
};

/** Stock levels for a set of products. Missing products come back as zero, never as undefined. */
export async function getStockLevels(
  exec: Executor,
  productIds: string[],
): Promise<StockLevel[]> {
  if (productIds.length === 0) return [];

  const rows = await exec
    .select({
      productId: stockLevels.productId,
      onHand: stockLevels.onHand,
      avgCostPaise: stockLevels.avgCostPaise,
    })
    .from(stockLevels)
    .where(inArray(stockLevels.productId, productIds));

  const byId = new Map(rows.map((r) => [r.productId, r]));
  return productIds.map((productId) => {
    const row = byId.get(productId);
    return {
      productId,
      onHand: row?.onHand ?? 0,
      avgCostPaise: row?.avgCostPaise ?? 0,
    };
  });
}

export async function getStockLevel(exec: Executor, productId: string): Promise<StockLevel> {
  const [row] = await getStockLevels(exec, [productId]);
  return row;
}

/**
 * Total value of stock at cost. Used for the dashboard and for cycle closing valuation
 * (opening/closing stock value in settlement).
 */
export async function stockValuePaise(exec: Executor, productIds?: string[]): Promise<number> {
  const q = exec
    .select({
      value:
        sql<number>`coalesce(sum(greatest(${stockLevels.onHand}, 0) * ${stockLevels.avgCostPaise}), 0)`.mapWith(
          Number,
        ),
    })
    .from(stockLevels);
  const [row] = productIds ? await q.where(inArray(stockLevels.productId, productIds)) : await q;
  return row?.value ?? 0;
}

/** Products at or below their low-stock threshold (dashboard / digest). */
export async function lowStockProducts(exec: Executor) {
  return exec
    .select({
      id: products.id,
      name: products.name,
      onHand: stockLevels.onHand,
      threshold: products.lowStockThreshold,
    })
    .from(products)
    .innerJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(
      sql`${products.isActive} = true
          and ${products.lowStockThreshold} is not null
          and ${stockLevels.onHand} <= ${products.lowStockThreshold}`,
    )
    .orderBy(stockLevels.onHand);
}

/** Export for scripts that want the singleton without importing "@/db" twice. */
export const database = db;
