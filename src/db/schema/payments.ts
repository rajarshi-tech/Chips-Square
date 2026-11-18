import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { paymentDirection, paymentKind, paymentMethod, paymentStatus } from "./enums";
import { purchaseShares } from "./purchasing";
import { users } from "./identity";

/**
 * Partner money movement: what a partner owes into a purchase, and what they are paid out at
 * settlement. Counter sales do NOT create rows here — a sale carries its own payment method.
 *
 * The `utr` column is the anti-argument device: one UPI reference can never settle two
 * obligations, and a screenshot is stored as evidence, never as proof.
 */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: paymentKind("kind").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    method: paymentMethod("method").notNull(),
    direction: paymentDirection("direction").notNull(),
    /** 12-digit UPI reference. Null for cash. Unique when present. */
    utr: text("utr"),
    status: paymentStatus("status").notNull().default("PENDING"),
    /** Set for PARTNER_CONTRIBUTION: which share this settles. */
    purchaseShareId: uuid("purchase_share_id").references(() => purchaseShares.id, {
      onDelete: "restrict",
    }),
    /** settlement_shares.id — plain column, no FK, to keep schema modules acyclic. */
    settlementShareId: uuid("settlement_share_id"),
    /** Screenshot path. Evidence only. */
    proofPath: text("proof_path"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_utr_unique").on(t.utr),
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_purchase_share_idx").on(t.purchaseShareId),
  ],
);

export const paymentsRelations = relations(payments, ({ one }) => ({
  purchaseShare: one(purchaseShares, {
    fields: [payments.purchaseShareId],
    references: [purchaseShares.id],
  }),
}));
