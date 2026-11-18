import { relations } from "drizzle-orm";
import { boolean, date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { userRole } from "./enums";

/**
 * Identity.
 *
 * `CUSTOMER` is now a read-only role: they browse stock and submit feedback, nothing else.
 * Admins manage inventory; partners see the money side.
 *
 * A `partners` row is the *financial* identity (someone who owns a share of the pool) and is
 * optional-but-usually-linked to a user. This split lets you add a partner who never logs in.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  name: text("name"),
  role: userRole("role").notNull().default("CUSTOMER"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  contact: text("contact"),
  joinedAt: date("joined_at").notNull(),
  leftAt: date("left_at"),
  /**
   * Default share for NEW cycles only (e.g. 20.00 for 1/5). Null means "split equally among
   * active partners". Never read at settlement time — read the snapshot in settlement_shares.
   */
  defaultSharePct: numeric("default_share_pct", { precision: 5, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one }) => ({
  partner: one(partners, { fields: [users.id], references: [partners.userId] }),
}));

export const partnersRelations = relations(partners, ({ one }) => ({
  user: one(users, { fields: [partners.userId], references: [users.id] }),
}));
