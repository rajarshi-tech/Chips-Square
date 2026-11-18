import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles } from "@/db/schema/purchasing";
import { saleItems, sales } from "@/db/schema/sales";
import { products } from "@/db/schema/catalog";
import { stockLevels } from "@/db/schema/stock";
import { lowStockProducts, stockValuePaise } from "@/lib/inventory";
import { formatINR } from "@/lib/money";

/**
 * Read model for the admin dashboard. One function, one round of queries, no derived state stored
 * anywhere — everything here can be recomputed from the ledger and the sales table.
 */

export type OpenCycleSummary = {
  id: string;
  name: string;
  openedAt: string;
  revenuePaise: number;
  unitsSold: number;
  saleCount: number;
};

export type RecentSale = {
  id: string;
  code: string;
  soldAt: Date;
  totalPaise: number;
  totalLabel: string;
  method: string;
  buyerName: string | null;
  voided: boolean;
};

export type LowStockRow = { id: string; name: string; onHand: number; threshold: number | null };

export type AdminOverview = {
  productCount: number;
  unitsOnHand: number;
  stockValuePaise: number;
  stockValueLabel: string;
  openCycle: OpenCycleSummary | null;
  recentSales: RecentSale[];
  lowStock: LowStockRow[];
};

export async function adminOverview(): Promise<AdminOverview> {
  const [totals] = await db
    .select({
      productCount: sql<number>`count(*)::int`,
      unitsOnHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)::int`,
    })
    .from(products)
    .leftJoin(stockLevels, eq(stockLevels.productId, products.id))
    .where(eq(products.isActive, true));

  const [openCycleRow] = await db
    .select({ id: cycles.id, name: cycles.name, openedAt: cycles.openedAt })
    .from(cycles)
    .where(eq(cycles.status, "OPEN"))
    .orderBy(desc(cycles.openedAt))
    .limit(1);

  let openCycle: OpenCycleSummary | null = null;
  if (openCycleRow) {
    const [agg] = await db
      .select({
        revenuePaise: sql<number>`coalesce(sum(${sales.totalPaise}), 0)::int`,
        saleCount: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(sql`${sales.cycleId} = ${openCycleRow.id} and ${sales.voidedAt} is null`);

    const [units] = await db
      .select({ unitsSold: sql<number>`coalesce(sum(${saleItems.qty}), 0)::int` })
      .from(saleItems)
      .innerJoin(sales, eq(sales.id, saleItems.saleId))
      .where(sql`${sales.cycleId} = ${openCycleRow.id} and ${sales.voidedAt} is null`);

    openCycle = {
      id: openCycleRow.id,
      name: openCycleRow.name,
      openedAt: openCycleRow.openedAt,
      revenuePaise: agg?.revenuePaise ?? 0,
      saleCount: agg?.saleCount ?? 0,
      unitsSold: units?.unitsSold ?? 0,
    };
  }

  const recent = await db
    .select({
      id: sales.id,
      code: sales.code,
      soldAt: sales.soldAt,
      totalPaise: sales.totalPaise,
      method: sales.method,
      buyerName: sales.buyerName,
      voidedAt: sales.voidedAt,
    })
    .from(sales)
    .orderBy(desc(sales.soldAt))
    .limit(5);

  const valuePaise = await stockValuePaise(db);
  const low = await lowStockProducts(db);

  return {
    productCount: totals?.productCount ?? 0,
    unitsOnHand: totals?.unitsOnHand ?? 0,
    stockValuePaise: valuePaise,
    stockValueLabel: formatINR(valuePaise),
    openCycle,
    recentSales: recent.map((r) => ({
      id: r.id,
      code: r.code,
      soldAt: r.soldAt,
      totalPaise: r.totalPaise,
      totalLabel: formatINR(r.totalPaise),
      method: r.method,
      buyerName: r.buyerName,
      voided: r.voidedAt !== null,
    })),
    lowStock: low.map((l) => ({
      id: l.id,
      name: l.name,
      onHand: l.onHand,
      threshold: l.threshold,
    })),
  };
}

/** Count of sales today, used by the dashboard's "today" tile. */
export async function salesToday(): Promise<{ count: number; totalPaise: number }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalPaise: sql<number>`coalesce(sum(${sales.totalPaise}), 0)::int`,
    })
    .from(sales)
    .where(sql`${sales.voidedAt} is null and ${sales.soldAt} >= current_date`);

  return { count: row?.count ?? 0, totalPaise: row?.totalPaise ?? 0 };
}
