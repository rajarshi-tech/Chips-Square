import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { feedbackStatus, feedbackType } from "./enums";
import { users } from "./identity";

/**
 * Feedback / item requests. Anonymous submissions are allowed, so user_id is nullable and the
 * contact fields are free text. Rate-limited + captcha'd at the route level.
 */

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name"),
    contact: text("contact"),
    type: feedbackType("type").notNull(),
    body: text("body").notNull(),
    /** For ITEM_REQUEST: the free-text product name, pre-fills the add-product form. */
    requestedItem: text("requested_item"),
    status: feedbackStatus("status").notNull().default("NEW"),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("feedback_status_idx").on(t.status, t.createdAt)],
);

/** "+1 I want this too" — dedupes demand so the inbox sorts by real interest. */
export const feedbackVotes = pgTable(
  "feedback_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feedbackId: uuid("feedback_id")
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feedback_votes_unique_idx").on(t.feedbackId, t.userId)],
);

export const feedbackRelations = relations(feedback, ({ one, many }) => ({
  user: one(users, { fields: [feedback.userId], references: [users.id] }),
  votes: many(feedbackVotes),
}));

export const feedbackVotesRelations = relations(feedbackVotes, ({ one }) => ({
  feedback: one(feedback, { fields: [feedbackVotes.feedbackId], references: [feedback.id] }),
  user: one(users, { fields: [feedbackVotes.userId], references: [users.id] }),
}));
