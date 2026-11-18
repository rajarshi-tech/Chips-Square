import { pgEnum } from "drizzle-orm/pg-core";

/**
 * All enums live here so migrations stay stable and every table imports from one place.
 * Adding a value to a pgEnum needs its own migration — see docs/05-runbook.md "changing an enum".
 */

// Two roles only: the site owner, and everyone else who runs the shop. Five people share the work;
// one of them owns the website and decides who gets access.
export const userRole = pgEnum("user_role", ["OWNER", "ADMIN"]);

export const supplier = pgEnum("supplier", [
  "BLINKIT",
  "FLIPKART_MINUTES",
  "ZEPTO",
  "JIOMART",
  "LOCAL",
  "OTHER",
]);

export const cycleStatus = pgEnum("cycle_status", ["OPEN", "CLOSED", "SETTLED"]);

export const purchaseShareStatus = pgEnum("purchase_share_status", [
  "OWED",
  "PARTIAL",
  "SETTLED",
]);

export const stockMovementType = pgEnum("stock_movement_type", [
  "PURCHASE",
  "SALE",
  "RETURN",
  "DAMAGE",
  "EXPIRY",
  "SELF_USE",
  "ADJUSTMENT",
]);

/** How money actually changed hands at the counter, or between partners. */
export const paymentMethod = pgEnum("payment_method", ["CASH", "UPI", "BANK_TRANSFER"]);

/** Only partner money movement is tracked as a payment. Counter sales carry their own method. */
export const paymentKind = pgEnum("payment_kind", [
  "PARTNER_CONTRIBUTION",
  "PARTNER_PAYOUT",
]);

export const paymentDirection = pgEnum("payment_direction", ["IN", "OUT"]);

export const paymentStatus = pgEnum("payment_status", ["PENDING", "VERIFIED", "REJECTED"]);

export const expenseKind = pgEnum("expense_kind", [
  "DELIVERY",
  "PACKAGING",
  "TRANSPORT",
  "ADS",
  "MISC",
]);

export const settlementStatus = pgEnum("settlement_status", ["DRAFT", "FINAL"]);

export const feedbackType = pgEnum("feedback_type", [
  "SUGGESTION",
  "ITEM_REQUEST",
  "BUG",
  "COMPLAINT",
]);

export const feedbackStatus = pgEnum("feedback_status", [
  "NEW",
  "ACKED",
  "PLANNED",
  "DONE",
  "REJECTED",
]);

export const notificationChannel = pgEnum("notification_channel", [
  "EMAIL",
  "TELEGRAM",
  "SMS",
]);

export const notificationStatus = pgEnum("notification_status", ["PENDING", "SENT", "FAILED"]);
