import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, stockLevels, stockMovements, users } from "@/db/schema";
import { getStockLevel, recordMovement, refreshStockLevel } from "@/lib/inventory";
import { rupeesToPaise } from "@/lib/money";
import {
  resolveMovement,
  StockRuleError,
  wouldGoNegative,
  type AdjustKind,
} from "@/lib/stock-rules";

/**
 * The stock screen's read model and its one write path.
 *
 * There is exactly one way units enter or leave here: `adjustStock`, which resolves a reason into a
 * movement, refuses to go below zero, and writes inside a transaction. Nothing sets `on_hand`
 * directly — that number is always `SUM(stock_movements.qty_delta)`.
 */

export type StockRow = {
  id: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  onHand: number;
  avgCostPaise: number;
  valuePaise: number;
  lowStockThreshold: number | null;
  lastMovementAt: Date | null;
  isActive: boolean;
};

export type MovementRow = {
  id: string;
  productId: string;
  productName: string;
  type: string;
  qtyDelta: number;
  unitCostPaise: number | null;
  note: string | null;
  createdAt: Date;
  actor: string | null;
};

export type StockDetail = {
  product: StockRow;
  movements: MovementRow[];
};

export class NotEnoughStockError extends StockRuleError {
  constructor(readonly onHand: number) {
    super(`Only ${onHand} on the shelf — cannot take out more than that`);
    this.name = "NotEnoughStockError";
  }
}

export async function listStockRows(opts: {
  q?: string;
  status?: "all" | "active" | "low" | "out" | "archived";
  limit?: number;
}): Promise<StockRow[]> {
  const conditions = [];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(ilike(products.name, like), ilike(products.brand, like), eq(products.barcode, q)),
    );
  }

  const rows = await db
    .select({
      product: products,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
      avgCostPaise: sql<number>`coalesce(${stockLevels.avgCostPaise}, 0)::int`,
      lastMovementAt: stockLevels.lastMovementAt,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(products.name))
    .limit(opts.limit ?? 300);

  const mapped = rows.map(({ product, onHand, avgCostPaise, lastMovementAt }) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    sizeLabel: product.sizeLabel,
    onHand,
    avgCostPaise,
    valuePaise: onHand * avgCostPaise,
    lowStockThreshold: product.lowStockThreshold,
    lastMovementAt,
    isActive: product.isActive,
  }));

  switch (opts.status) {
    case "active":
      return mapped.filter((r) => r.isActive);
    case "low":
      return mapped.filter((r) => r.lowStockThreshold !== null && r.onHand <= r.lowStockThreshold);
    case "out":
      return mapped.filter((r) => r.onHand <= 0);
    case "archived":
      return mapped.filter((r) => !r.isActive);
    default:
      return mapped;
  }
}

export async function getStockDetail(productId: string): Promise<StockDetail | null> {
  const [row] = await listStockRowsById(productId);
  if (!row) return null;
  return { product: row, movements: await movementsFor(productId, 30) };
}

async function listStockRowsById(productId: string): Promise<StockRow[]> {
  const rows = await db
    .select({
      product: products,
      onHand: sql<number>`coalesce(${stockLevels.onHand}, 0)::int`,
      avgCostPaise: sql<number>`coalesce(${stockLevels.avgCostPaise}, 0)::int`,
      lastMovementAt: stockLevels.lastMovementAt,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(eq(products.id, productId))
    .limit(1);

  return rows.map(({ product, onHand, avgCostPaise, lastMovementAt }) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    sizeLabel: product.sizeLabel,
    onHand,
    avgCostPaise,
    valuePaise: onHand * avgCostPaise,
    lowStockThreshold: product.lowStockThreshold,
    lastMovementAt,
    isActive: product.isActive,
  }));
}

async function movementsFor(productId: string, limit: number): Promise<MovementRow[]> {
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      type: stockMovements.type,
      qtyDelta: stockMovements.qtyDelta,
      unitCostPaise: stockMovements.unitCostPaise,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    type: r.type,
    qtyDelta: r.qtyDelta,
    unitCostPaise: r.unitCostPaise,
    note: r.note,
    createdAt: r.createdAt,
    actor: r.actorName ?? r.actorEmail ?? null,
  }));
}

export async function recentMovements(limit = 15): Promise<MovementRow[]> {
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      type: stockMovements.type,
      qtyDelta: stockMovements.qtyDelta,
      unitCostPaise: stockMovements.unitCostPaise,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName,
    type: r.type,
    qtyDelta: r.qtyDelta,
    unitCostPaise: r.unitCostPaise,
    note: r.note,
    createdAt: r.createdAt,
    actor: r.actorName ?? r.actorEmail ?? null,
  }));
}

/**
 * The single write path. Returns the new on-hand count so the UI can confirm what happened.
 */
export async function adjustStock(input: {
  productId: string;
  kind: AdjustKind;
  qty: number;
  costRupees?: string | number | null;
  note?: string | null;
  actorId: string;
}): Promise<{ onHand: number; qtyDelta: number }> {
  const unitCostPaise =
    input.costRupees === null || input.costRupees === undefined || input.costRupees === ""
      ? null
      : rupeesToPaise(input.costRupees);

  const movement = resolveMovement({
    kind: input.kind,
    qty: input.qty,
    unitCostPaise,
  });

  const note = input.note?.trim() || null;
  if (movement.noteRequired && !note) {
    throw new StockRuleError("Add a short note so this adjustment explains itself later");
  }

  return db.transaction(async (tx) => {
    const level = await getStockLevel(tx, input.productId);
    if (wouldGoNegative(level.onHand, movement.qtyDelta)) {
      throw new NotEnoughStockError(level.onHand);
    }

    await recordMovement(tx, {
      productId: input.productId,
      type: movement.type,
      qtyDelta: movement.qtyDelta,
      unitCostPaise: movement.unitCostPaise,
      note,
      createdBy: input.actorId,
    });

    const after = await getStockLevel(tx, input.productId);
    return { onHand: after.onHand, qtyDelta: movement.qtyDelta };
  });
}

/** Rebuild the cached level from the ledger. Safe at any time; used when a number looks wrong. */
export async function recalcStockLevel(productId: string): Promise<number> {
  await refreshStockLevel(db, productId);
  const level = await getStockLevel(db, productId);
  return level.onHand;
}
