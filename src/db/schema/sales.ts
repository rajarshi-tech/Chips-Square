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
import {
  orderStatus,
  paymentDirection,
  paymentKind,
  paymentMethod,
  paymentStatus,
} from "./enums";
import { cycles, purchaseShares } from "./purchasing";
import { users } from "./identity";

/**
 * Sales: reservations, and the payments that prove them.
 *
 * The state machine (docs/02 §2, docs/01 §11):
 *   HOLD -> PAYMENT_PENDING -> PAID -> READY -> FULFILLED
 *   HOLD/PAYMENT_PENDING + expiry -> EXPIRED (stock released, no_show_count += 1)
 *   PAID/READY + abandoned      -> CANCELLED -> REFUNDED
 *
 * A row in `orders` in HOLD/PAYMENT_PENDING/PAID/READY consumes stock.
 */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short human code, appears in the UPI note and on the pickup screen. e.g. CS-8F3K2 */
    code: text("code").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: orderStatus("status").notNull().default("HOLD"),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull(),
    /** now() + settings.hold_ttl_minutes at creation. Stock is released when this passes. */
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }).notNull(),
    /** The 12-digit UPI reference the customer claims to have sent. Verified by a human or gateway. */
    declaredUtr: text("declared_utr"),
    /** Shown to the customer after PAID; staff types it on the pickup screen. */
    pickupCode: text("pickup_code"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    /** Machine-readable reason: EXPIRED_UNPAID, REJECTED_UTR, USER_CANCELLED, UNCLAIMED, ... */
    closedReason: text("closed_reason"),
    /** Which batch this sale belongs to, for settlement. Snapshot at creation. */
    cycleId: uuid("cycle_id").references(() => cycles.id, { onDelete: "restrict" }),
    /** Proof that the customer accepted the reservation policy. */
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_expiry_idx").on(t.status, t.holdExpiresAt),
    index("orders_cycle_idx").on(t.cycleId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull(),
    /** Price charged per unit, incl. any discount applied to this line. */
    unitPricePaise: integer("unit_price_paise").notNull(),
    /** COGS snapshot: weighted average cost at the moment of sale. Never recomputed. */
    unitCostPaise: integer("unit_cost_paise").notNull(),
    /** Name snapshot so historical orders render correctly after a product is renamed. */
    nameSnapshot: text("name_snapshot").notNull(),
  },
  (t) => [
    uniqueIndex("order_items_unique_idx").on(t.orderId, t.productId),
    index("order_items_product_idx").on(t.productId),
  ],
);

/**
 * One payment table for four kinds of money movement. See docs/01 §7.
 *
 * The UNIQUE utr is the anti-fraud keystone: one UPI reference can never settle two obligations.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: paymentKind("kind").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    method: paymentMethod("method").notNull(),
    direction: paymentDirection("direction").notNull(),
    /** 12-digit UPI reference (UTR/RRN). Null for cash. Unique when present. */
    utr: text("utr"),
    gatewayPaymentId: text("gateway_payment_id"),
    status: paymentStatus("status").notNull().default("PENDING"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    purchaseShareId: uuid("purchase_share_id").references(() => purchaseShares.id, {
      onDelete: "restrict",
    }),
    /** settlements_shares.id — plain column, no FK, to keep schema modules acyclic. */
    settlementShareId: uuid("settlement_share_id"),
    /** Screenshot path. Evidence only, never proof. */
    proofPath: text("proof_path"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_utr_unique").on(t.utr),
    uniqueIndex("payments_gateway_unique").on(t.gatewayPaymentId),
    index("payments_status_idx").on(t.status, t.createdAt),
    index("payments_order_idx").on(t.orderId),
  ],
);

/**
 * Fair queue for scarce items (docs/02 §6). No stock is held by a waitlist entry.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull().default(1),
    position: integer("position").notNull(),
    /** Set when stock frees up and we grant a time-boxed payment window. */
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("waitlist_unique_idx").on(t.productId, t.userId),
    index("waitlist_queue_idx").on(t.productId, t.position),
  ],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  cycle: one(cycles, { fields: [orders.cycleId], references: [cycles.id] }),
  items: many(orderItems),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  purchaseShare: one(purchaseShares, {
    fields: [payments.purchaseShareId],
    references: [purchaseShares.id],
  }),
}));
