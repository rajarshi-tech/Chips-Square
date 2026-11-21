import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles, expenses, purchases } from "@/db/schema/purchasing";
import { saleItems, sales } from "@/db/schema/sales";
import { partners } from "@/db/schema/identity";
import { settlementShares, settlements } from "@/db/schema/settlement";
import { stockValuePaise } from "@/lib/inventory";
import { splitEvenly } from "@/lib/money";

/**
 * Cycle settlement: turning a batch of trading into five equal payouts.
 *
 *   profit = revenue − cogs − expenses
 *
 * - **revenue** is what customers paid: `sales.total_paise`, voided sales excluded.
 * - **cogs** is the cost of the units that actually left, taken from each `sale_items.unit_cost_paise`
 *   snapshot. Not the cost of everything bought — that would tax partners for stock still on the shelf.
 * - **expenses** are the cycle's running costs (delivery, packaging, ads).
 * - **unsold stock is carried forward** at weighted average cost (`stock_levels.avg_cost_paise`), never
 *   distributed. Distributing it would pay out money that is still sitting in a packet of chips.
 *
 * The preview is computed live and never stored: a DRAFT settlement that nobody recalculates is a
 * number that quietly goes stale. Only `finaliseSettlement` writes rows, and those are snapshots.
 */

export type SettlementFigures = {
  revenuePaise: number;
  cogsPaise: number;
  expensesPaise: number;
  profitPaise: number;
  openingStockValuePaise: number;
  closingStockValuePaise: number;
  distributedPaise: number;
};

export type PreviewShare = {
  partnerId: string;
  partnerName: string;
  sharePct: string;
  amountPaise: number;
};

export type SettlementPreview = {
  cycle: {
    id: string;
    name: string;
    status: "OPEN" | "CLOSED" | "SETTLED";
    openedAt: string;
    closedAt: string | null;
  };
  figures: SettlementFigures;
  counts: { sales: number; units: number; purchases: number; expenseLines: number; partners: number };
  shares: PreviewShare[];
  /** Plain-language things the operator should read before finalising. */
  warnings: string[];
  existingSettlementId: string | null;
};

export class SettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementError";
  }
}

/**
 * Pure formula, so the arithmetic can be tested without a database.
 *
 * A loss is not distributed and not "negative-paid": the money stayed in the central account, and the
 * loss simply reduces what is there. Distributing a negative number would mean asking partners to pay
 * into the pool at settlement, which is a conversation, not a calculation.
 */
export function computeProfit(input: {
  revenuePaise: number;
  cogsPaise: number;
  expensesPaise: number;
}): { profitPaise: number; distributablePaise: number } {
  const profitPaise = input.revenuePaise - input.cogsPaise - input.expensesPaise;
  return { profitPaise, distributablePaise: Math.max(0, profitPaise) };
}

/** Equal share of a total, as a 2dp percentage string for the snapshot. */
export function equalSharePct(partnerCount: number): string {
  if (partnerCount <= 0) return "0.00";
  return (100 / partnerCount).toFixed(2);
}

export async function settlementPreview(cycleId: string): Promise<SettlementPreview | null> {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
  if (!cycle) return null;

  const [money] = await db
    .select({
      revenuePaise: sql<number>`coalesce(sum(${sales.totalPaise}), 0)::int`,
      saleCount: sql<number>`count(*)::int`,
    })
    .from(sales)
    .where(and(eq(sales.cycleId, cycleId), isNull(sales.voidedAt)));

  const [cogs] = await db
    .select({
      cogsPaise: sql<number>`coalesce(sum(${saleItems.unitCostPaise} * ${saleItems.qty}), 0)::int`,
      units: sql<number>`coalesce(sum(${saleItems.qty}), 0)::int`,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(eq(sales.cycleId, cycleId), isNull(sales.voidedAt)));

  const [spend] = await db
    .select({
      expensesPaise: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)::int`,
      expenseLines: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(eq(expenses.cycleId, cycleId));

  const [buying] = await db
    .select({ purchaseCount: sql<number>`count(*)::int` })
    .from(purchases)
    .where(eq(purchases.cycleId, cycleId));

  const closingStockValuePaise = await stockValuePaise(db);

  const revenuePaise = money?.revenuePaise ?? 0;
  const cogsPaise = cogs?.cogsPaise ?? 0;
  const expensesPaise = spend?.expensesPaise ?? 0;
  const { profitPaise, distributablePaise } = computeProfit({
    revenuePaise,
    cogsPaise,
    expensesPaise,
  });

  const activePartners = await db
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(isNull(partners.leftAt))
    .orderBy(asc(partners.name));

  const amounts = splitEvenly(
    distributablePaise,
    activePartners.map(() => 1),
  );
  const sharePct = equalSharePct(activePartners.length);

  const shares: PreviewShare[] = activePartners.map((partner, index) => ({
    partnerId: partner.id,
    partnerName: partner.name,
    sharePct,
    amountPaise: amounts[index] ?? 0,
  }));

  const [existing] = await db
    .select({ id: settlements.id, status: settlements.status })
    .from(settlements)
    .where(eq(settlements.cycleId, cycleId))
    .limit(1);

  const warnings: string[] = [];
  if ((money?.saleCount ?? 0) === 0) warnings.push("No sales in this cycle — nothing to distribute.");
  if (activePartners.length === 0) warnings.push("No active partners, so there is nobody to pay.");
  if (profitPaise < 0) {
    warnings.push(
      `This cycle lost money. Nothing is paid out; the loss stays in the central account.`,
    );
  }
  if (closingStockValuePaise > 0) {
    warnings.push(
      "Unsold stock stays on the shelf and is carried into the next cycle, not distributed.",
    );
  }
  if ((cogs?.units ?? 0) > 0 && cogsPaise === 0) {
    warnings.push(
      "Units were sold with no recorded cost. Check that stock was received with a cost per unit.",
    );
  }

  return {
    cycle: {
      id: cycle.id,
      name: cycle.name,
      status: cycle.status,
      openedAt: cycle.openedAt,
      closedAt: cycle.closedAt,
    },
    figures: {
      revenuePaise,
      cogsPaise,
      expensesPaise,
      profitPaise,
      openingStockValuePaise: cycle.openingStockValuePaise,
      closingStockValuePaise,
      distributedPaise: amounts.reduce((a, b) => a + b, 0),
    },
    counts: {
      sales: money?.saleCount ?? 0,
      units: cogs?.units ?? 0,
      purchases: buying?.purchaseCount ?? 0,
      expenseLines: spend?.expenseLines ?? 0,
      partners: activePartners.length,
    },
    shares,
    warnings,
    existingSettlementId: existing?.id ?? null,
  };
}

/**
 * Freeze the figures and the split. One transaction, and one shot per cycle: `settlements.cycle_id`
 * is unique, so a double-click cannot pay everyone twice.
 */
export async function finaliseSettlement(input: {
  cycleId: string;
  actorId: string;
  notes?: string | null;
}): Promise<{ settlementId: string }> {
  const preview = await settlementPreview(input.cycleId);
  if (!preview) throw new SettlementError("That cycle does not exist");
  if (preview.existingSettlementId) throw new SettlementError("This cycle is already settled");
  if (preview.shares.length === 0) throw new SettlementError("No partners to pay");

  const today = new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    const [settlement] = await tx
      .insert(settlements)
      .values({
        cycleId: input.cycleId,
        revenuePaise: preview.figures.revenuePaise,
        cogsPaise: preview.figures.cogsPaise,
        expensesPaise: preview.figures.expensesPaise,
        openingStockValuePaise: preview.figures.openingStockValuePaise,
        closingStockValuePaise: preview.figures.closingStockValuePaise,
        profitPaise: preview.figures.profitPaise,
        distributedPaise: preview.figures.distributedPaise,
        status: "FINAL",
        createdBy: input.actorId,
        finalisedAt: new Date(),
        notes: input.notes ?? null,
      })
      .returning({ id: settlements.id });

    await tx.insert(settlementShares).values(
      preview.shares.map((share) => ({
        settlementId: settlement.id,
        partnerId: share.partnerId,
        sharePct: share.sharePct,
        amountPaise: share.amountPaise,
      })),
    );

    await tx
      .update(cycles)
      .set({ status: "CLOSED", closedAt: today })
      .where(eq(cycles.id, input.cycleId));

    return { settlementId: settlement.id };
  });
}

/** Mark one partner's share as actually paid. Nothing here moves money; it records that a human did. */
export async function markSharePaid(shareId: string): Promise<void> {
  await db.update(settlementShares).set({ paidAt: new Date() }).where(eq(settlementShares.id, shareId));

  const [share] = await db
    .select({ settlementId: settlementShares.settlementId })
    .from(settlementShares)
    .where(eq(settlementShares.id, shareId))
    .limit(1);
  if (!share) return;

  const [outstanding] = await db
    .select({ unpaid: sql<number>`count(*)::int` })
    .from(settlementShares)
    .where(and(eq(settlementShares.settlementId, share.settlementId), isNull(settlementShares.paidAt)));

  if ((outstanding?.unpaid ?? 0) === 0) {
    const [settlement] = await db
      .select({ cycleId: settlements.cycleId })
      .from(settlements)
      .where(eq(settlements.id, share.settlementId))
      .limit(1);
    if (settlement) {
      await db.update(cycles).set({ status: "SETTLED" }).where(eq(cycles.id, settlement.cycleId));
    }
  }
}

export type CycleRow = {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED" | "SETTLED";
  openedAt: string;
  closedAt: string | null;
  revenuePaise: number;
  saleCount: number;
  settlementId: string | null;
};

export async function listCycles(): Promise<CycleRow[]> {
  const rows = await db
    .select({
      id: cycles.id,
      name: cycles.name,
      status: cycles.status,
      openedAt: cycles.openedAt,
      closedAt: cycles.closedAt,
      // Literal `cycles.id`, not the interpolated column: drizzle drops the table qualifier for a
      // column of the table being selected from, so ${cycles.id} renders as bare "id" and the
      // subquery silently compares against sales.id instead (every row came back 0).
      revenuePaise: sql<number>`coalesce((
        select sum(s.total_paise) from sales s
        where s.cycle_id = cycles.id and s.voided_at is null
      ), 0)::int`,
      saleCount: sql<number>`coalesce((
        select count(*) from sales s
        where s.cycle_id = cycles.id and s.voided_at is null
      ), 0)::int`,
      settlementId: sql<string | null>`(
        select st.id from settlements st where st.cycle_id = cycles.id limit 1
      )`,
    })
    .from(cycles)
    .orderBy(desc(cycles.openedAt));

  return rows;
}

/** Only one cycle may be open at a time — sales need an unambiguous home. */
export async function ensureSingleOpenCycle(): Promise<{ id: string; name: string } | null> {
  const open = await db
    .select({ id: cycles.id, name: cycles.name })
    .from(cycles)
    .where(eq(cycles.status, "OPEN"))
    .orderBy(desc(cycles.openedAt));

  return open[0] ?? null;
}

export async function createCycle(input: { name: string; openedAt: string }): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new SettlementError("Give the cycle a name, e.g. August 2026");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.openedAt)) throw new SettlementError("Pick a start date");

  const open = await ensureSingleOpenCycle();
  if (open) {
    throw new SettlementError(
      `${open.name} is still open. Close and settle it before starting another.`,
    );
  }

  const [created] = await db
    .insert(cycles)
    .values({ name, openedAt: input.openedAt, openingStockValuePaise: await stockValuePaise(db) })
    .returning({ id: cycles.id });
  return created;
}

export type SettlementView = {
  settlement: {
    id: string;
    status: "DRAFT" | "FINAL";
    finalisedAt: Date | null;
    notes: string | null;
    figures: SettlementFigures;
  };
  shares: (PreviewShare & { id: string; paidAt: Date | null })[];
};

export async function getSettlementForPreview(
  preview: SettlementPreview,
): Promise<SettlementView | null> {
  if (!preview.existingSettlementId) return null;

  const [row] = await db
    .select()
    .from(settlements)
    .where(eq(settlements.id, preview.existingSettlementId))
    .limit(1);
  if (!row) return null;

  const shares = await db
    .select({
      id: settlementShares.id,
      partnerId: settlementShares.partnerId,
      partnerName: partners.name,
      sharePct: settlementShares.sharePct,
      amountPaise: settlementShares.amountPaise,
      paidAt: settlementShares.paidAt,
    })
    .from(settlementShares)
    .innerJoin(partners, eq(partners.id, settlementShares.partnerId))
    .where(eq(settlementShares.settlementId, row.id))
    .orderBy(asc(partners.name));

  return {
    settlement: {
      id: row.id,
      status: row.status,
      finalisedAt: row.finalisedAt,
      notes: row.notes,
      figures: {
        revenuePaise: row.revenuePaise,
        cogsPaise: row.cogsPaise,
        expensesPaise: row.expensesPaise,
        profitPaise: row.profitPaise,
        openingStockValuePaise: row.openingStockValuePaise,
        closingStockValuePaise: row.closingStockValuePaise,
        distributedPaise: row.distributedPaise,
      },
    },
    shares,
  };
}
