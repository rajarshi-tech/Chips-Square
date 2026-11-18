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
import { stockMovementType } from "./enums";
import { purchases } from "./purchasing";

/**
 * Append-only stock ledger. THE source of truth for inventory.
 *
 *   on_hand(product) = SUM(qty_delta)
 *
 * There are no reservations, so on_hand IS the number a customer sees. No derived "available".
 *
 * Rules (enforced in src/lib/inventory.ts, documented in docs/01-data-model.md §5):
 *   - never UPDATE, never DELETE. A correction is a new opposite movement.
 *   - DAMAGE / EXPIRY / SELF_USE / ADJUSTMENT require a note.
 *   - PURCHASE and SALE require unit_cost_paise (it is the COGS snapshot).
 */

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: stockMovementType("type").notNull(),
    /** Signed: +received, -sold/lost. Never zero. */
    qtyDelta: integer("qty_delta").notNull(),
    unitCostPaise: integer("unit_cost_paise"),
    purchaseId: uuid("purchase_id").references(() => purchases.id, { onDelete: "restrict" }),
    /** sales.id — plain column, no FK, to keep schema modules acyclic. */
    saleId: uuid("sale_id"),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId, t.createdAt),
    index("stock_movements_sale_idx").on(t.saleId),
    index("stock_movements_purchase_idx").on(t.purchaseId),
  ],
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  purchase: one(purchases, { fields: [stockMovements.purchaseId], references: [purchases.id] }),
}));

/**
 * Per-product rollup of the ledger. Maintained by `src/lib/inventory.ts#refreshStockLevels`
 * after every write that touches stock — a cache of a SUM, never an independent truth.
 * If it and the ledger disagree, the ledger wins and this table is rebuilt.
 */
export const stockLevels = pgTable(
  "stock_levels",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    onHand: integer("on_hand").notNull().default(0),
    /** Weighted average cost of what is on the shelf, in paise. Used for stock valuation. */
    avgCostPaise: integer("avg_cost_paise").notNull().default(0),
    lastMovementAt: timestamp("last_movement_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("stock_levels_product_unique").on(t.productId)],
);
