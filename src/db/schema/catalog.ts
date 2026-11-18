import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Catalog truth. Cost and stock do NOT live here — see purchasing.ts and stock.ts.
 *
 * Pricing rule (one implementation: src/lib/pricing.ts):
 *   sellPrice = priceOverride ? manualSellPrice : round(mrp * (100 - discountPct) / 100)
 *
 * All money is integer paise.
 */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category"),
    /** Human pack size: "165 g", "1 L", "pack of 6". */
    sizeLabel: text("size_label"),
    /** EAN/UPC. Used for Open Food Facts lookups and duplicate detection. */
    barcode: text("barcode").unique(),
    /** Printed MRP. The price the customer sees struck through. */
    mrpPaise: integer("mrp_paise").notNull(),
    /** Discount off MRP, admin-editable. 15.00 = 15% off. */
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    /** Manual price. Only used when priceOverride is true. */
    manualSellPricePaise: integer("manual_sell_price_paise"),
    priceOverride: boolean("price_override").notNull().default(false),
    /** Path in our own storage. Never a hotlinked store CDN URL. */
    imagePath: text("image_path"),
    description: text("description"),
    /** Low-stock alert threshold; null disables the alert for this product. */
    lowStockThreshold: integer("low_stock_threshold"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_name_idx").on(t.name),
    index("products_category_idx").on(t.category),
    // Cheap duplicate guard: same brand + name + size, case/space-insensitive.
    uniqueIndex("products_identity_idx").on(t.brand, t.name, t.sizeLabel),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);

export const productsRelations = relations(products, ({ many }) => ({
  images: many(productImages),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));
