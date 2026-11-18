import { relations } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { settlementStatus } from "./enums";
import { partners } from "./identity";
import { cycles } from "./purchasing";

/**
 * Cycle settlement: turning revenue into per-partner payouts.
 *
 * All figures are snapshots taken at finalise time by src/lib/settle.ts, so a later data change
 * cannot silently alter a historical distribution. See docs/01-data-model.md §8.
 */

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "restrict" })
      .unique(),
    revenuePaise: integer("revenue_paise").notNull(),
    cogsPaise: integer("cogs_paise").notNull(),
    expensesPaise: integer("expenses_paise").notNull(),
    openingStockValuePaise: integer("opening_stock_value_paise").notNull().default(0),
    /** Value of unsold stock at cost, carried into the next cycle. Not distributed. */
    closingStockValuePaise: integer("closing_stock_value_paise").notNull().default(0),
    profitPaise: integer("profit_paise").notNull(),
    distributedPaise: integer("distributed_paise").notNull().default(0),
    status: settlementStatus("status").notNull().default("DRAFT"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalisedAt: timestamp("finalised_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [index("settlements_cycle_idx").on(t.cycleId)],
);

export const settlementShares = pgTable(
  "settlement_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** payments.id — plain column, no FK, to keep schema modules acyclic. */
    paymentId: uuid("payment_id"),
    note: text("note"),
  },
  (t) => [uniqueIndex("settlement_shares_unique_idx").on(t.settlementId, t.partnerId)],
);

export const settlementsRelations = relations(settlements, ({ one, many }) => ({
  cycle: one(cycles, { fields: [settlements.cycleId], references: [cycles.id] }),
  shares: many(settlementShares),
}));

export const settlementSharesRelations = relations(settlementShares, ({ one }) => ({
  settlement: one(settlements, {
    fields: [settlementShares.settlementId],
    references: [settlements.id],
  }),
  partner: one(partners, { fields: [settlementShares.partnerId], references: [partners.id] }),
}));
