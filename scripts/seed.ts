import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  auditLog,
  cycles,
  expenses,
  feedback,
  feedbackVotes,
  notificationLog,
  partners,
  payments,
  productImages,
  products,
  purchaseItems,
  purchaseShares,
  purchases,
  saleItems,
  sales,
  settlementShares,
  settlements,
  settings,
  stockLevels,
  stockMovements,
  users,
} from "../src/db/schema";
import { slugify } from "../src/lib/codes";
import { recordMovement } from "../src/lib/inventory";
import { hashPassword } from "../src/lib/auth/password";
import { computeSellPrice, splitEvenly } from "../src/lib/money";

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
  await db.delete(saleItems);
  await db.delete(sales);
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
    showExactStock: true,
    hideOutOfStock: false,
  });

  console.log("→ users + partners");
  // Demo staff credentials. Override or remove before pointing this at real data.
  const demoPassword = process.env.SEED_PASSWORD ?? "chips-demo-2026";
  const demoHash = await hashPassword(demoPassword);

  const userRows = await db
    .insert(users)
    .values([
      {
        email: "owner@chipssquare.in",
        name: "Owner",
        phone: "+919000000001",
        role: "OWNER",
        passwordHash: demoHash,
      },
      {
        email: "staff@chipssquare.in",
        name: "Shop Staff",
        phone: "+919000000002",
        role: "ADMIN",
        passwordHash: demoHash,
      },
      // Every partner who signs in is an ADMIN; only the site owner is an OWNER.
      {
        email: "partner@chipssquare.in",
        name: "Partner Two",
        phone: "+919000000003",
        role: "ADMIN",
        passwordHash: demoHash,
      },
    ])
    .returning({ id: users.id, email: users.email });

  const ownerId = userRows.find((u) => u.email === "owner@chipssquare.in")!.id;
  const staffId = userRows.find((u) => u.email === "staff@chipssquare.in")!.id;
  const partnerUserId = userRows.find((u) => u.email === "partner@chipssquare.in")!.id;

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
    .returning({
      id: products.id,
      name: products.name,
      mrpPaise: products.mrpPaise,
      discountPct: products.discountPct,
    });

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

  console.log("→ two counter sales");
  const sellOf = (p: { mrpPaise: number; discountPct: string }) =>
    computeSellPrice({ mrpPaise: p.mrpPaise, discountPct: p.discountPct });

  const productA = productRows[0]; // Lay's
  const productD = productRows[3]; // Haldiram's
  const productF = productRows[5]; // Amul dark chocolate

  const salePlans = [
    {
      code: "S-DEMO01",
      soldAt: ago(6),
      method: "UPI" as const,
      buyerName: "Priya, 3rd floor",
      lines: [
        { product: productA, qty: 5 },
        { product: productD, qty: 3 },
      ],
    },
    {
      code: "S-DEMO02",
      soldAt: ago(2),
      method: "CASH" as const,
      buyerName: null,
      lines: [{ product: productF, qty: 2 }],
    },
  ];

  const createdSales: { id: string; code: string; totalPaise: number }[] = [];

  for (const plan of salePlans) {
    const subtotal = plan.lines.reduce(
      (a, l) => a + sellOf(l.product) * l.qty,
      0,
    );

    const [sale] = await db
      .insert(sales)
      .values({
        code: plan.code,
        cycleId: cycle.id,
        soldAt: plan.soldAt,
        subtotalPaise: subtotal,
        totalPaise: subtotal,
        method: plan.method,
        buyerName: plan.buyerName,
        createdBy: staffId,
      })
      .returning({ id: sales.id, code: sales.code, totalPaise: sales.totalPaise });

    createdSales.push(sale);

    await db.insert(saleItems).values(
      plan.lines.map((l) => ({
        saleId: sale.id,
        productId: l.product.id,
        qty: l.qty,
        unitPricePaise: sellOf(l.product),
        unitCostPaise: costByProduct.get(l.product.name)!,
        nameSnapshot: l.product.name,
      })),
    );

    for (const l of plan.lines) {
      await recordMovement(db, {
        productId: l.product.id,
        type: "SALE",
        qtyDelta: -l.qty,
        unitCostPaise: costByProduct.get(l.product.name)!,
        saleId: sale.id,
        createdBy: staffId,
      });
    }
  }

  console.log("→ expense, feedback");
  await db.insert(expenses).values({
    cycleId: cycle.id,
    kind: "TRANSPORT",
    amountPaise: 1500,
    paidByPartnerId: partnerRows[1].id,
    reimbursable: true,
    note: "Auto fare for pickup run",
    incurredAt: dayAgo(21),
  });

  const revenue = createdSales.reduce((a, s) => a + s.totalPaise, 0);
  const cogs = salePlans.reduce(
    (a, plan) =>
      a + plan.lines.reduce((b, l) => b + costByProduct.get(l.product.name)! * l.qty, 0),
    0,
  );
  const expensesTotal = 1500;
  const profit = revenue - cogs - expensesTotal;

  // No settlement row on purpose: the cycle is left OPEN so the preview on /admin/cycles/<id> can be
  // checked against these numbers, and closing it is something you can try. Preview is always live.
  const profitShares = splitEvenly(profit, PARTNER_NAMES.map(() => 1));

  const [fb1] = await db
    .insert(feedback)
    .values([
      {
        userId: partnerUserId,
        name: "Priya",
        contact: "partner@chipssquare.in",
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

  await db.insert(feedbackVotes).values({ feedbackId: fb1.id, userId: ownerId });

  const [{ count: productCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(products);
  const [{ onHand }] = await db
    .select({ onHand: sql<number>`coalesce(sum(${stockLevels.onHand}), 0)`.mapWith(Number) })
    .from(stockLevels);

  console.log("");
  console.log("✓ seed complete");
  console.log(`  products        ${productCount}`);
  console.log(`  units on hand   ${onHand}`);
  console.log(`  purchase total  ${purchase.totalPaise} paise`);
  console.log(`  partner shares  ${shares.join(" / ")}`);
  console.log(`  sales           ${createdSales.map((s) => s.code).join(", ")}`);
  console.log(`  revenue         ${revenue} paise`);
  console.log(`  profit so far   ${profit} paise`);
  console.log(`  split preview   ${profitShares.join(" / ")}`);
  console.log("");
  console.log("  sign in at /login");
  console.log(`    owner@chipssquare.in   ${demoPassword}  (OWNER)`);
  console.log(`    staff@chipssquare.in   ${demoPassword}  (ADMIN)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  });
