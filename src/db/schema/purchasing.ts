import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { cycleStatus, expenseKind, purchaseShareStatus, supplier } from "./enums";
import { partners } from "./identity";

/**
 * The cost side: what we bought, for how much, from where, and who paid.
 *
 * A `cycle` is the unit of "we bought this batch, we sold it, now settle".
 * It is NOT a calendar period. See docs/01-data-model.md §8 for the settlement math.
 */

export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  openedAt: date("opened_at").notNull(),
  closedAt: date("closed_at"),
  status: cycleStatus("status").notNull().default("OPEN"),
  /** Value of stock carried in from the previous cycle, at cost. */
  openingStockValuePaise: integer("opening_stock_value_paise").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "restrict" }),
    supplier: supplier("supplier").notNull(),
    purchasedAt: date("purchased_at").notNull(),
    /** The partner who actually paid the store; everyone else owes them. */
    paidByPartnerId: uuid("paid_by_partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    invoiceTotalPaise: integer("invoice_total_paise").notNull(),
    deliveryFeePaise: integer("delivery_fee_paise").notNull().default(0),
    packagingFeePaise: integer("packaging_fee_paise").notNull().default(0),
    otherFeePaise: integer("other_fee_paise").notNull().default(0),
    /** invoice + fees. Denormalised on purpose: it is what people actually reconcile against. */
    totalPaise: integer("total_paise").notNull(),
    invoiceRef: text("invoice_ref"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchases_cycle_idx").on(t.cycleId, t.purchasedAt)],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    /** What we paid per unit AFTER the store discount. This is the COGS source. */
    unitCostPaise: integer("unit_cost_paise").notNull(),
    /** MRP printed on the pack that day — used to sanity-check our selling price. */
    mrpPaise: integer("mrp_paise").notNull(),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId)],
);

/**
 * Snapshot of who owes what for one purchase. Created in the same transaction as the purchase,
 * from the partners active on `purchasedAt`. Adding partner #6 tomorrow does not rewrite this.
 */
export const purchaseShares = pgTable(
  "purchase_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
    amountOwedPaise: integer("amount_owed_paise").notNull(),
    amountPaidPaise: integer("amount_paid_paise").notNull().default(0),
    status: purchaseShareStatus("status").notNull().default("OWED"),
  },
  (t) => [uniqueIndex("purchase_shares_unique_idx").on(t.purchaseId, t.partnerId)],
);

/** Extra costs that reduce cycle profit (delivery, packaging, ads, transport). */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "restrict" }),
    kind: expenseKind("kind").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paidByPartnerId: uuid("paid_by_partner_id").references(() => partners.id, {
      onDelete: "set null",
    }),
    reimbursable: boolean("reimbursable").notNull().default(false),
    note: text("note"),
    incurredAt: date("incurred_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("expenses_cycle_idx").on(t.cycleId)],
);

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  cycle: one(cycles, { fields: [purchases.cycleId], references: [cycles.id] }),
  paidBy: one(partners, { fields: [purchases.paidByPartnerId], references: [partners.id] }),
  items: many(purchaseItems),
  shares: many(purchaseShares),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}));

export const purchaseSharesRelations = relations(purchaseShares, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseShares.purchaseId], references: [purchases.id] }),
  partner: one(partners, { fields: [purchaseShares.partnerId], references: [partners.id] }),
}));
