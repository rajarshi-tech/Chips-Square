import { pgEnum } from "drizzle-orm/pg-core";

/**
 * All enums live here so migrations stay stable and every table imports from one place.
 * Adding a value to a pgEnum requires a migration that recreates the type — see
 * docs/05-runbook.md "changing an enum".
 */

export const userRole = pgEnum("user_role", ["CUSTOMER", "PARTNER", "ADMIN", "OWNER"]);

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

export const orderStatus = pgEnum("order_status", [
  "HOLD",
  "PAYMENT_PENDING",
  "PAID",
  "READY",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

export const paymentKind = pgEnum("payment_kind", [
  "CUSTOMER_RECEIPT",
  "PARTNER_CONTRIBUTION",
  "PARTNER_PAYOUT",
  "REFUND",
]);

export const paymentMethod = pgEnum("payment_method", [
  "UPI_MANUAL",
  "UPI_GATEWAY",
  "CASH",
  "BANK_TRANSFER",
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
