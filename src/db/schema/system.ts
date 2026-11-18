import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { notificationChannel, notificationStatus } from "./enums";

/**
 * Cross-cutting tables: settings (single row), audit log, notification log.
 */

/**
 * One row, id = 1. Read through src/lib/settings.ts which caches per request.
 * Changing these values changes runtime behaviour — no deploy required.
 */
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  /** UPI VPA the customer pays into. Public by nature. */
  upiId: text("upi_id").notNull().default("chipssquare@upi"),
  upiPayeeName: text("upi_payee_name").notNull().default("Chips Square"),
  qrImagePath: text("qr_image_path"),
  shopName: text("shop_name").notNull().default("Chips Square"),
  supportPhone: text("support_phone"),
  supportEmail: text("support_email"),
  termsText: text("terms_text"),

  /** Show exact stock counts on the public shelf, or only In stock / Low / Out. */
  showExactStock: boolean("show_exact_stock").notNull().default(true),
  /** Hide anything with zero stock from the public shelf instead of showing "out of stock". */
  hideOutOfStock: boolean("hide_out_of_stock").notNull().default(false),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every mutation to money or stock writes here. This is the dispute resolver — if it is not in
 * the audit log, it did not happen.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id"),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Proof that we tried to notify someone, and why it failed. */
export const notificationLog = pgTable("notification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: notificationChannel("channel").notNull(),
  toAddr: text("to_addr"),
  template: text("template").notNull(),
  status: notificationStatus("status").notNull().default("PENDING"),
  payload: jsonb("payload"),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
