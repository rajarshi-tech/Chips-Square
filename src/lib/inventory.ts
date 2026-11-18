import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { orderItems, orders, products, stockLevels, stockMovements } from "@/db/schema";

/**
 * Inventory rules. `stock_movements` is the source of truth; `stock_levels` is a cache of its SUM.
 *
 * Every function takes an `Executor` so it can run inside or outside a transaction.
 */

export type Executor = Pick<Database, "insert" | "select" | "update" | "delete" | "execute">;

/** Order statuses that are currently consuming stock. Keep in sync with docs/01 §11. */
export const STOCK_CONSUMING_STATUSES = ["HOLD", "PAYMENT_PENDING", "PAID", "READY"] as const;

export type MovementInput = {
  productId: string;
  type: (typeof stockMovements.$inferInsert)["type"];
  /** Signed. Positive = into stock, negative = out. */
  qtyDelta: number;
  unitCostPaise?: number | null;
  purchaseId?: string | null;
  orderId?: string | null;
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
    orderId: input.orderId ?? null,
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
      purchasedQty: sql<number>`coalesce(sum(case when ${stockMovements.type} = 'PURCHASE' then ${stockMovements.qtyDelta} else 0 end), 0)`.mapWith(
        Number,
      ),
      purchasedCost: sql<number>`coalesce(sum(case when ${stockMovements.type} = 'PURCHASE' then ${stockMovements.qtyDelta} * coalesce(${stockMovements.unitCostPaise}, 0) else 0 end), 0)`.mapWith(
        Number,
      ),
      lastAt: sql<string | null>`max(${stockMovements.createdAt})`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));

  const avgCostPaise =
    totals && totals.purchasedQty > 0 ? Math.round(totals.purchasedCost / totals.purchasedQty) : 0;

  await exec
    .insert(stockLevels)
    .values({
      productId,
      onHand: totals?.onHand ?? 0,
      avgCostPaise,
      lastMovementAt: totals?.lastAt ? new Date(totals.lastAt) : null,
    })
    .onConflictDoUpdate({
      target: stockLevels.productId,
      set: {
        onHand: totals?.onHand ?? 0,
        avgCostPaise,
        lastMovementAt: totals?.lastAt ? new Date(totals.lastAt) : null,
      },
    });
}

export type StockRow = {
  productId: string;
  onHand: number;
  avgCostPaise: number;
  /** Quantity currently promised to open reservations. */
  held: number;
  /** onHand - held. This is what the customer can actually reserve. */
  available: number;
};

/**
 * On-hand minus open reservations for the given products.
 *
 * A HOLD only counts while its TTL is live; PAID/READY count unconditionally (the customer has
 * already paid, the goods are theirs). FULFILLED orders are already out via SALE movements.
 */
export async function getStockRows(exec: Executor, productIds: string[]): Promise<StockRow[]> {
  if (productIds.length === 0) return [];

  const levels = await exec
    .select({
      productId: stockLevels.productId,
      onHand: stockLevels.onHand,
      avgCostPaise: stockLevels.avgCostPaise,
    })
    .from(stockLevels)
    .where(inArray(stockLevels.productId, productIds));

  const holds = await exec
    .select({
      productId: orderItems.productId,
      held: sql<number>`coalesce(sum(${orderItems.qty}), 0)`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        inArray(orderItems.productId, productIds),
        sql`(
          ${orders.status} in ('PAID', 'READY')
          or (${orders.status} in ('HOLD', 'PAYMENT_PENDING') and ${orders.holdExpiresAt} > now())
        )`,
      ),
    )
    .groupBy(orderItems.productId);

  const heldByProduct = new Map(holds.map((h) => [h.productId, h.held]));
  const levelByProduct = new Map(levels.map((l) => [l.productId, l]));

  return productIds.map((productId) => {
    const level = levelByProduct.get(productId);
    const onHand = level?.onHand ?? 0;
    const held = heldByProduct.get(productId) ?? 0;
    return {
      productId,
      onHand,
      avgCostPaise: level?.avgCostPaise ?? 0,
      held,
      available: onHand - held,
    };
  });
}

/** Convenience for a single product, throwing if the id is unknown. */
export async function getStockRow(exec: Executor, productId: string): Promise<StockRow> {
  const [row] = await getStockRows(exec, [productId]);
  if (!row) throw new Error(`Unknown product ${productId}`);
  return row;
}

/**
 * Total value of stock at cost. Used for the dashboard and for cycle closing valuation
 * (opening/closing stock value in settlement).
 */
export async function stockValuePaise(exec: Executor, productIds?: string[]): Promise<number> {
  const q = exec
    .select({
      value: sql<number>`coalesce(sum(greatest(${stockLevels.onHand}, 0) * ${stockLevels.avgCostPaise}), 0)`.mapWith(
        Number,
      ),
    })
    .from(stockLevels);
  const [row] = productIds
    ? await q.where(inArray(stockLevels.productId, productIds))
    : await q;
  return row?.value ?? 0;
}

/**
 * Flip lapsed reservations to EXPIRED. Safe to run repeatedly; returns the ids it closed so the
 * caller can send notifications and apply no-show strikes.
 *
 * Stock does not need to be "given back" — availability is derived from status + expiry, so it is
 * already free. This call exists to make history honest and to trigger the strike.
 */
export async function expireStaleOrders(exec: Executor): Promise<{ id: string; userId: string }[]> {
  const expired = await exec
    .update(orders)
    .set({ status: "EXPIRED", closedReason: "EXPIRED_UNPAID" })
    .where(
      and(
        inArray(orders.status, ["HOLD", "PAYMENT_PENDING"]),
        sql`${orders.holdExpiresAt} <= now()`,
      ),
    )
    .returning({ id: orders.id, userId: orders.userId });

  return expired;
}

/** Products at or below their low-stock threshold (dashboard / daily digest). */
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
