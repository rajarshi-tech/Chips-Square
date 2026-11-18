import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles } from "@/db/schema/purchasing";
import { products } from "@/db/schema/catalog";
import { saleItems, sales } from "@/db/schema/sales";
import { getStockLevel, recordMovement, type Executor } from "@/lib/inventory";
import { computeSellPrice } from "@/lib/money";
import { newSaleCode } from "@/lib/codes";

/**
 * Counter sales: the moment goods leave the shop, and the revenue that the profit split is built on.
 *
 * `createSale` and `voidSale` are the only writers. Both run in one transaction and move stock
 * through the same `stock_movements` ledger as everything else, so the public shelf and the
 * settlement can never disagree about what happened.
 *
 * Sale line items snapshot the cost at the moment of sale (`unit_cost_paise`), so a later price
 * change to a product can never rewrite a past sale's COGS.
 */

export class SaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleError";
  }
}

export type SaleLine = { productId: string; qty: number; unitPricePaise?: number | null };

export type CreateSaleInput = {
  lines: SaleLine[];
  method: "CASH" | "UPI" | "BANK_TRANSFER";
  buyerName?: string | null;
  note?: string | null;
  actorId: string;
};

export type CreatedSale = { id: string; code: string; totalPaise: number };

const METHOD = new Set(["CASH", "UPI", "BANK_TRANSFER"]);

/** Merge lines for the same product (the sale_items table forbids duplicates within one sale). */
function mergeLines(lines: SaleLine[]): SaleLine[] {
  const byProduct = new Map<string, SaleLine>();
  for (const line of lines) {
    const existing = byProduct.get(line.productId);
    if (!existing) {
      byProduct.set(line.productId, { ...line });
      continue;
    }
    existing.qty += line.qty;
    if (line.unitPricePaise != null) existing.unitPricePaise = line.unitPricePaise;
  }
  return [...byProduct.values()];
}

/** A sale needs a home cycle. Auto-create the current month's if none is open. */
async function ensureOpenCycle(tx: Executor): Promise<string> {
  const [open] = await tx
    .select({ id: cycles.id })
    .from(cycles)
    .where(eq(cycles.status, "OPEN"))
    .limit(1);
  if (open) return open.id;

  const now = new Date();
  const name = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const openedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [created] = await tx
    .insert(cycles)
    .values({ name, openedAt })
    .returning({ id: cycles.id });
  return created.id;
}

export async function createSale(input: CreateSaleInput): Promise<CreatedSale> {
  const lines = mergeLines(input.lines);
  if (lines.length === 0) throw new SaleError("Add at least one product to the sale");
  if (!METHOD.has(input.method)) throw new SaleError("Pick a payment method");

  return db.transaction(async (tx) => {
    const cycleId = await ensureOpenCycle(tx);

    const ids = lines.map((l) => l.productId);
    const catalog = await tx
      .select()
      .from(products)
      .where(and(inArray(products.id, ids), eq(products.isActive, true)));
    const byId = new Map(catalog.map((p) => [p.id, p]));

    let subtotalPaise = 0;
    let totalPaise = 0;
    const items: {
      productId: string;
      qty: number;
      unitPricePaise: number;
      unitCostPaise: number;
      nameSnapshot: string;
    }[] = [];

    for (const line of lines) {
      const product = byId.get(line.productId);
      if (!product) throw new SaleError("A line refers to a product that is missing or archived");

      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new SaleError("Quantity must be a positive whole number");
      }

      const level = await getStockLevel(tx, line.productId);
      if (line.qty > level.onHand) {
        throw new SaleError(`Only ${level.onHand} of ${product.name} on the shelf`);
      }

      const unitPricePaise =
        line.unitPricePaise ??
        computeSellPrice({
          mrpPaise: product.mrpPaise,
          discountPct: product.discountPct,
          priceOverride: product.priceOverride,
          manualSellPricePaise: product.manualSellPricePaise,
        });

      if (!Number.isInteger(unitPricePaise) || unitPricePaise < 0) {
        throw new SaleError(`Price for ${product.name} looks wrong`);
      }

      items.push({
        productId: line.productId,
        qty: line.qty,
        unitPricePaise,
        unitCostPaise: level.avgCostPaise,
        nameSnapshot: product.name,
      });
      subtotalPaise += product.mrpPaise * line.qty;
      totalPaise += unitPricePaise * line.qty;
    }

    const [sale] = await tx
      .insert(sales)
      .values({
        code: newSaleCode(),
        cycleId,
        subtotalPaise,
        discountPaise: Math.max(0, subtotalPaise - totalPaise),
        totalPaise,
        method: input.method,
        buyerName: input.buyerName?.trim() || null,
        note: input.note?.trim() || null,
        createdBy: input.actorId,
      })
      .returning({ id: sales.id, code: sales.code, totalPaise: sales.totalPaise });

    await tx.insert(saleItems).values(
      items.map((it) => ({ saleId: sale.id, ...it })),
    );

    for (const it of items) {
      await recordMovement(tx, {
        productId: it.productId,
        type: "SALE",
        qtyDelta: -it.qty,
        unitCostPaise: it.unitCostPaise,
        saleId: sale.id,
        note: `sale ${sale.code}`,
        createdBy: input.actorId,
      });
    }

    return sale;
  });
}

export async function voidSale(input: {
  saleId: string;
  reason: string;
  actorId: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) throw new SaleError("Give a reason for voiding — it is a permanent record");

  const [sale] = await db
    .select({ id: sales.id, code: sales.code })
    .from(sales)
    .where(and(eq(sales.id, input.saleId), isNull(sales.voidedAt)))
    .limit(1);
  if (!sale) throw new SaleError("Sale not found or already voided");

  await db.transaction(async (tx) => {
    const items = await tx
      .select({ productId: saleItems.productId, qty: saleItems.qty, unitCostPaise: saleItems.unitCostPaise })
      .from(saleItems)
      .where(eq(saleItems.saleId, sale.id));

    await tx
      .update(sales)
      .set({ voidedAt: new Date(), voidedBy: input.actorId, voidReason: reason })
      .where(eq(sales.id, sale.id));

    for (const it of items) {
      await recordMovement(tx, {
        productId: it.productId,
        type: "RETURN",
        qtyDelta: it.qty,
        unitCostPaise: it.unitCostPaise,
        saleId: sale.id,
        note: `void ${sale.code}: ${reason}`,
        createdBy: input.actorId,
      });
    }
  });
}

// --- read model ---

export type SaleRow = {
  id: string;
  code: string;
  soldAt: Date;
  totalPaise: number;
  method: string;
  buyerName: string | null;
  voided: boolean;
  itemCount: number;
  unitCount: number;
};

export async function listSales(opts: { scope?: "today" | "recent"; limit?: number } = {}): Promise<SaleRow[]> {
  const conditions = [];
  if (opts.scope === "today") conditions.push(sql`${sales.soldAt} >= current_date`);

  const rows = await db
    .select({
      id: sales.id,
      code: sales.code,
      soldAt: sales.soldAt,
      totalPaise: sales.totalPaise,
      method: sales.method,
      buyerName: sales.buyerName,
      voidedAt: sales.voidedAt,
      itemCount: sql<number>`count(distinct ${saleItems.id})::int`,
      unitCount: sql<number>`coalesce(sum(case when ${sales.voidedAt} is null then ${saleItems.qty} else 0 end), 0)::int`,
    })
    .from(sales)
    .leftJoin(saleItems, eq(saleItems.saleId, sales.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sales.id)
    .orderBy(desc(sales.soldAt))
    .limit(opts.limit ?? 50);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    soldAt: r.soldAt,
    totalPaise: r.totalPaise,
    method: r.method,
    buyerName: r.buyerName,
    voided: r.voidedAt !== null,
    itemCount: r.itemCount,
    unitCount: r.unitCount,
  }));
}

export type SalesSummary = { count: number; totalPaise: number; units: number };

export async function salesSummary(): Promise<SalesSummary> {
  const [row] = await db
    .select({
      // Voided sales are history, not takings: they are excluded from both count and money.
      count: sql<number>`count(case when ${sales.voidedAt} is null then 1 end)::int`,
      totalPaise: sql<number>`coalesce(sum(case when ${sales.voidedAt} is null then ${sales.totalPaise} else 0 end), 0)::int`,
    })
    .from(sales)
    .where(sql`${sales.soldAt} >= current_date`);

  const [units] = await db
    .select({
      units: sql<number>`coalesce(sum(${saleItems.qty}), 0)::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(sql`${sales.soldAt} >= current_date`, isNull(sales.voidedAt)));

  return { count: row?.count ?? 0, totalPaise: row?.totalPaise ?? 0, units: units?.units ?? 0 };
}