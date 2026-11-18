import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  auditLog,
  cycles,
  expenses,
  feedback,
  feedbackVotes,
  notificationLog,
  orderItems,
  orders,
  partners,
  payments,
  productImages,
  products,
  purchaseItems,
  purchaseShares,
  purchases,
  settlementShares,
  settlements,
  settings,
  stockLevels,
  stockMovements,
  users,
  waitlistEntries,
} from "../src/db/schema";
import { newOrderCode, newPickupCode, slugify } from "../src/lib/codes";
import { recordMovement } from "../src/lib/inventory";
import { computeSellPrice, pctOf, splitEvenly } from "../src/lib/money";

/**
 * Seed a realistic demo dataset so every screen has something in it and the split maths is
 * visibly correct on day one.
 *
 *   npm run db:seed
 *
 * Refuses to run against DATABASE_URL unless --force, because it truncates everything.
 */

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const soon = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
/** `date` columns take a YYYY-MM-DD string, not a Date. */
const dayAgo = (days: number) => ago(days).toISOString().slice(0, 10);

const PARTNER_NAMES = ["Aarav", "Bhavna", "Chirag", "Divya", "Eshan"];

const CATALOG = [
  { name: "Classic Salted", brand: "Lay's", size: "52 g", mrp: 2000, disc: 10, cost: 1450 },
  { name: "Masala Munch", brand: "Kurkure", size: "90 g", mrp: 2000, disc: 12, cost: 1420 },
  { name: "Mad Angles Achaari Masti", brand: "Bingo", size: "66 g", mrp: 2000, disc: 15, cost: 1350 },
  { name: "Aloo Bhujia", brand: "Haldiram's", size: "200 g", mrp: 5500, disc: 18, cost: 4200 },
  { name: "Dairy Milk", brand: "Cadbury", size: "55 g", mrp: 4000, disc: 8, cost: 3100 },
  { name: "Dark Chocolate 55%", brand: "Amul", size: "150 g", mrp: 12500, disc: 20, cost: 8900 },
  { name: "Iodised Salt", brand: "Tata", size: "1 kg", mrp: 2800, disc: 5, cost: 2400 },
  { name: "2-Minute Noodles Masala", brand: "Maggi", size: "70 g", mrp: 1400, disc: 10, cost: 1150 },
  { name: "Thums Up", brand: "Coca-Cola", size: "750 ml", mrp: 4500, disc: 12, cost: 3400 },
  { name: "Parle-G Gold", brand: "Parle", size: "200 g", mrp: 3000, disc: 10, cost: 2450 },
  { name: "Mixed Fruit Juice", brand: "Real", size: "1 L", mrp: 13000, disc: 15, cost: 9500 },
  { name: "Strong Teeth Toothpaste", brand: "Colgate", size: "200 g", mrp: 12500, disc: 22, cost: 8300 },
];

async function truncateAll() {
  // Order matters: children before parents.
  await db.delete(notificationLog);
  await db.delete(auditLog);
  await db.delete(feedbackVotes);
  await db.delete(feedback);
  await db.delete(payments);
  await db.delete(orderItems);
  await db.delete(waitlistEntries);
  await db.delete(orders);
  await db.delete(settlementShares);
  await db.delete(settlements);
  await db.delete(stockLevels);
  await db.delete(stockMovements);
  await db.delete(expenses);
  await db.delete(purchaseShares);
  await db.delete(purchaseItems);
  await db.delete(purchases);
  await db.delete(cycles);
  await db.delete(productImages);
  await db.delete(products);
  await db.delete(partners);
  await db.delete(users);
  await db.delete(settings);
}

async function main() {
  if (process.env.DATABASE_URL && !process.argv.includes("--force")) {
    console.error("✗ DATABASE_URL is set. Seeding truncates everything — refusing without --force.");
    process.exit(1);
  }

  console.log("→ clearing existing data");
  await truncateAll();

  console.log("→ settings");
  await db.insert(settings).values({
    id: 1,
    upiId: "chipssquare@upi",
    upiPayeeName: "Chips Square",
    shopName: "Chips Square",
    supportEmail: "ops@chipssquare.in",
    holdTtlMinutes: 12,
    maxActiveHoldsPerUser: 2,
    noShowLimit: 2,
    unclaimedCancelDays: 7,
    termsText:
      "A reservation holds the item for 15 minutes. The item is yours only once payment is verified against our UPI statement. Unpaid reservations expire automatically. Collect within 7 days.",
  });

  console.log("→ users + partners");
  const ownerRows = await db
    .insert(users)
    .values([
      { email: "owner@chipssquare.in", name: "Owner", phone: "+919000000001", role: "OWNER" },
      { email: "customer@example.com", name: "Priya Customer", phone: "+919000000099", role: "CUSTOMER" },
      { email: "flaky@example.com", name: "Rahul Flaky", phone: "+919000000098", role: "CUSTOMER", noShowCount: 2 },
    ])
    .returning({ id: users.id, email: users.email });

  const ownerId = ownerRows.find((u) => u.email === "owner@chipssquare.in")!.id;
  const customerId = ownerRows.find((u) => u.email === "customer@example.com")!.id;
  const flakyId = ownerRows.find((u) => u.email === "flaky@example.com")!.id;

  const partnerRows = await db
    .insert(partners)
    .values(
      PARTNER_NAMES.map((name, i) => ({
        name,
        userId: i === 0 ? ownerId : null,
        contact: `+91900000000${i + 1}`,
        joinedAt: "2025-01-15",
        defaultSharePct: "20.00",
        isActive: true,
      })),
    )
    .returning({ id: partners.id, name: partners.name });

  console.log("→ products");
  const productRows = await db
    .insert(products)
    .values(
      CATALOG.map((p) => ({
        slug: slugify(`${p.name} ${p.size}`),
        name: p.name,
        brand: p.brand,
        category: "Snacks",
        sizeLabel: p.size,
        mrpPaise: p.mrp,
        discountPct: String(p.disc),
        isActive: true,
        lowStockThreshold: 5,
      })),
    )
    .returning({ id: products.id, name: products.name, mrpPaise: products.mrpPaise, discountPct: products.discountPct });

  console.log("→ cycle + bulk purchase from Blinkit");
  const [cycle] = await db
    .insert(cycles)
    .values({
      name: "Opening batch — Blinkit",
      openedAt: dayAgo(21),
      status: "OPEN",
    })
    .returning({ id: cycles.id });

  const costByProduct = new Map(CATALOG.map((c) => [c.name, c.cost]));
  const purchaseLines = productRows.slice(0, 8).map((p) => ({
    productId: p.id,
    name: p.name,
    qty: 10,
    unitCostPaise: costByProduct.get(p.name)!,
    mrpPaise: p.mrpPaise,
  }));

  const invoiceTotal = purchaseLines.reduce((a, l) => a + l.qty * l.unitCostPaise, 0);
  const deliveryFee = 4000;
  const packagingFee = 1500;

  const [purchase] = await db
    .insert(purchases)
    .values({
      cycleId: cycle.id,
      supplier: "BLINKIT",
      purchasedAt: dayAgo(21),
      paidByPartnerId: partnerRows[0].id,
      invoiceTotalPaise: invoiceTotal,
      deliveryFeePaise: deliveryFee,
      packagingFeePaise: packagingFee,
      otherFeePaise: 0,
      totalPaise: invoiceTotal + deliveryFee + packagingFee,
      invoiceRef: "BLK-4471902",
      createdBy: ownerId,
    })
    .returning({ id: purchases.id, totalPaise: purchases.totalPaise });

  await db.insert(purchaseItems).values(
    purchaseLines.map((l) => ({
      purchaseId: purchase.id,
      productId: l.productId,
      qty: l.qty,
      unitCostPaise: l.unitCostPaise,
      mrpPaise: l.mrpPaise,
    })),
  );

  // Snapshot: 5 active partners, equal split, largest remainder so paise are never lost.
  const shares = splitEvenly(purchase.totalPaise, PARTNER_NAMES.map(() => 1));
  await db.insert(purchaseShares).values(
    partnerRows.map((p, i) => ({
      purchaseId: purchase.id,
      partnerId: p.id,
      sharePct: "20.00",
      amountOwedPaise: shares[i],
      // Everyone except the payer has settled in this demo, so the ledger shows a real balance.
      amountPaidPaise: i === 0 ? shares[i] : 0,
      status: i === 0 ? ("SETTLED" as const) : ("OWED" as const),
    })),
  );

  for (const line of purchaseLines) {
    await recordMovement(db, {
      productId: line.productId,
      type: "PURCHASE",
      qtyDelta: line.qty,
      unitCostPaise: line.unitCostPaise,
      purchaseId: purchase.id,
      note: "Blinkit bulk order BLK-4471902",
      createdBy: ownerId,
    });
  }

  console.log("→ orders: one fulfilled sale, one live hold, one expired");
  const sellOf = (p: { mrpPaise: number; discountPct: string }) =>
    computeSellPrice({ mrpPaise: p.mrpPaise, discountPct: p.discountPct });

  const itemA = productRows[0];
  const itemB = productRows[3];
  const QTY_A = 5;
  const QTY_B = 3;
  const subtotal = sellOf(itemA) * QTY_A + sellOf(itemB) * QTY_B;

  const [fulfilled] = await db
    .insert(orders)
    .values({
      code: newOrderCode(),
      userId: customerId,
      status: "FULFILLED",
      subtotalPaise: subtotal,
      totalPaise: subtotal,
      holdExpiresAt: ago(3),
      pickupCode: newPickupCode(),
      paidAt: ago(4),
      readyAt: ago(4),
      fulfilledAt: ago(3),
      cycleId: cycle.id,
      termsAcceptedAt: ago(4),
    })
    .returning({ id: orders.id, code: orders.code, totalPaise: orders.totalPaise });

  await db.insert(orderItems).values([
    {
      orderId: fulfilled.id,
      productId: itemA.id,
      qty: QTY_A,
      unitPricePaise: sellOf(itemA),
      unitCostPaise: costByProduct.get(itemA.name)!,
      nameSnapshot: itemA.name,
    },
    {
      orderId: fulfilled.id,
      productId: itemB.id,
      qty: QTY_B,
      unitPricePaise: sellOf(itemB),
      unitCostPaise: costByProduct.get(itemB.name)!,
      nameSnapshot: itemB.name,
    },
  ]);

  await db.insert(payments).values({
    kind: "CUSTOMER_RECEIPT",
    amountPaise: fulfilled.totalPaise,
    method: "UPI_MANUAL",
    direction: "IN",
    utr: "431288910021",
    status: "VERIFIED",
    orderId: fulfilled.id,
    verifiedBy: ownerId,
    verifiedAt: ago(4),
  });

  for (const [productId, qty, cost] of [
    [itemA.id, QTY_A, costByProduct.get(itemA.name)!],
    [itemB.id, QTY_B, costByProduct.get(itemB.name)!],
  ] as [string, number, number][]) {
    await recordMovement(db, {
      productId,
      type: "SALE",
      qtyDelta: -qty,
      unitCostPaise: cost,
      orderId: fulfilled.id,
      createdBy: ownerId,
    });
  }

  const itemC = productRows[5];
  const liveSubtotal = sellOf(itemC);
  const [live] = await db
    .insert(orders)
    .values({
      code: newOrderCode(),
      userId: customerId,
      status: "HOLD",
      subtotalPaise: liveSubtotal,
      totalPaise: liveSubtotal,
      holdExpiresAt: soon(12),
      cycleId: cycle.id,
      termsAcceptedAt: new Date(),
    })
    .returning({ id: orders.id, code: orders.code });

  await db.insert(orderItems).values({
    orderId: live.id,
    productId: itemC.id,
    qty: 1,
    unitPricePaise: liveSubtotal,
    unitCostPaise: costByProduct.get(itemC.name)!,
    nameSnapshot: itemC.name,
  });

  await db.insert(orders).values({
    code: newOrderCode(),
    userId: flakyId,
    status: "EXPIRED",
    subtotalPaise: liveSubtotal,
    totalPaise: liveSubtotal,
    holdExpiresAt: ago(1),
    closedReason: "EXPIRED_UNPAID",
    cycleId: cycle.id,
  });

  console.log("→ expenses, draft settlement, feedback");
  await db.insert(expenses).values({
    cycleId: cycle.id,
    kind: "TRANSPORT",
    amountPaise: 1500,
    paidByPartnerId: partnerRows[1].id,
    reimbursable: true,
    note: "Auto fare for pickup run",
    incurredAt: dayAgo(21),
  });

  const [settlement] = await db
    .insert(settlements)
    .values({
      cycleId: cycle.id,
      revenuePaise: fulfilled.totalPaise,
      cogsPaise: costByProduct.get(itemA.name)! * QTY_A + costByProduct.get(itemB.name)! * QTY_B,
      expensesPaise: 1500,
      closingStockValuePaise: 0,
      profitPaise:
        fulfilled.totalPaise -
        (costByProduct.get(itemA.name)! * QTY_A + costByProduct.get(itemB.name)! * QTY_B) -
        1500,
      status: "DRAFT",
      createdBy: ownerId,
    })
    .returning({ id: settlements.id, profitPaise: settlements.profitPaise });

  const profitShares = splitEvenly(settlement.profitPaise, PARTNER_NAMES.map(() => 1));
  await db.insert(settlementShares).values(
    partnerRows.map((p, i) => ({
      settlementId: settlement.id,
      partnerId: p.id,
      sharePct: "20.00",
      amountPaise: profitShares[i],
    })),
  );

  const [fb1] = await db
    .insert(feedback)
    .values([
      {
        userId: customerId,
        name: "Priya",
        contact: "customer@example.com",
        type: "ITEM_REQUEST",
        body: "Can you stock the 330ml Thums Up cans instead of bottles?",
        requestedItem: "Thums Up 330ml can",
        status: "NEW",
      },
      {
        name: "Anonymous",
        type: "SUGGESTION",
        body: "Please add a filter for 'spicy' snacks.",
        status: "ACKED",
      },
    ])
    .returning({ id: feedback.id });

  await db.insert(feedbackVotes).values({ feedbackId: fb1.id, userId: flakyId });

  const [{ count: productCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(products);
  const [{ count: movementCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(stockMovements);
  const [{ onHand }] = await db
    .select({ onHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)`.mapWith(Number) })
    .from(stockLevels);

  console.log("");
  console.log("✓ seed complete");
  console.log(`  products        ${productCount}`);
  console.log(`  stock movements ${movementCount}`);
  console.log(`  units on hand   ${onHand}`);
  console.log(`  purchase total  ${purchase.totalPaise} paise`);
  console.log(`  partner shares  ${shares.join(" / ")}`);
  console.log(`  draft profit    ${settlement.profitPaise} paise`);
  console.log(`  live order      ${live.code} (holds stock for 12 min)`);

  const [{ usedSell }] = await db
    .select({ usedSell: sql<number>`count(*)`.mapWith(Number) })
    .from(products)
    .where(eq(products.isActive, true));
  void usedSell;
  void pctOf;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  });
