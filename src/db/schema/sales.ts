import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./catalog";
import { paymentMethod } from "./enums";
import { cycles } from "./purchasing";

/**
 * Sales recorded by an admin when goods leave the counter.
 *
 * There is no cart, no reservation and no online payment: customers see stock, and an admin logs
 * the sale when it happens. That keeps one source of truth for revenue without inventing a
 * checkout nobody asked for.
 *
 * A sale is never deleted. A mistake is *voided*: `voidedAt` is set and a RETURN movement puts the
 * units back on the shelf, so the ledger still explains every number.
 */

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short human code, e.g. S-8F3K2M. Shown on the receipt and in the audit trail. */
    code: text("code").notNull().unique(),
    /** Which batch this revenue belongs to, for settlement. */
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "restrict" }),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    method: paymentMethod("method").notNull().default("CASH"),
    /** Free text: "Priya, 3rd floor" or a phone number. Optional. */
    buyerName: text("buyer_name"),
    note: text("note"),
    createdBy: uuid("created_by"),
    /** Set when the sale was entered in error. Ignored by settlement once set. */
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by"),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_cycle_idx").on(t.cycleId, t.soldAt),
    index("sales_sold_at_idx").on(t.soldAt),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    /** Price charged per unit. */
    unitPricePaise: integer("unit_price_paise").notNull(),
    /** COGS snapshot: weighted average cost at the moment of sale. Never recomputed. */
    unitCostPaise: integer("unit_cost_paise").notNull(),
    /** Name snapshot so historical sales render correctly after a product is renamed. */
    nameSnapshot: text("name_snapshot").notNull(),
  },
  (t) => [
    uniqueIndex("sale_items_unique_idx").on(t.saleId, t.productId),
    index("sale_items_product_idx").on(t.productId),
  ],
);

export const salesRelations = relations(sales, ({ one, many }) => ({
  cycle: one(cycles, { fields: [sales.cycleId], references: [cycles.id] }),
  items: many(saleItems),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}));
