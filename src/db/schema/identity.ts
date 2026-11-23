import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { userRole } from "./enums";

/**
 * Identity.
 *
 * Everyone who can sign in is `ADMIN` (runs the shop) or `OWNER` (also manages accounts). Customers
 * need no account: the shop is public.
 * Admins manage inventory; partners see the money side.
 *
 * A `partners` row is the *financial* identity (someone who owns a share of the pool). Every admin
 * and owner has one, created automatically with the account (src/lib/partners.ts), because the
 * people who run the shop are the people the profit is split between. A partner may exist without
 * a user (someone who put money in but never signs in) — the link is nullable on that side, but one
 * user can only ever be one partner (`partners_user_idx`).
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  phone: text("phone").unique(),
  name: text("name"),
  role: userRole("role").notNull().default("ADMIN"),
  /**
   * scrypt hash in a self-describing string (see src/lib/auth/password.ts).
   * Null means the account cannot sign in yet — set it with `npm run user:password`.
   */
  passwordHash: text("password_hash"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partners = pgTable(
  "partners",
  {
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
  },
  // One account, one share. Postgres treats NULLs as distinct, so partners without a login are
  // unaffected. Without this, a double submit or a sync race could add the same person twice and
  // quietly halve everyone else's payout.
  (t) => [uniqueIndex("partners_user_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ one }) => ({
  partner: one(partners, { fields: [users.id], references: [partners.userId] }),
}));

export const partnersRelations = relations(partners, ({ one }) => ({
  user: one(users, { fields: [partners.userId], references: [users.id] }),
}));
