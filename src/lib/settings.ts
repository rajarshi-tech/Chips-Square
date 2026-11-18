import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

/**
 * Runtime settings, read once per request.
 *
 * The row is seeded by `npm run db:seed`. If it is missing (fresh database, before seeding) we fall
 * back to safe defaults rather than throwing — a broken settings row must not take the shop down.
 */

export type SettingsDto = {
  shopName: string;
  upiId: string;
  upiPayeeName: string;
  qrImagePath: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  termsText: string | null;
  showExactStock: boolean;
  hideOutOfStock: boolean;
};

export const DEFAULT_SETTINGS: SettingsDto = {
  shopName: "Chips Square",
  upiId: "chipssquare@upi",
  upiPayeeName: "Chips Square",
  qrImagePath: null,
  supportPhone: null,
  supportEmail: null,
  termsText: null,
  showExactStock: true,
  hideOutOfStock: false,
};

export const getSettings = cache(async (): Promise<SettingsDto> => {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (!row) return DEFAULT_SETTINGS;
    return {
      shopName: row.shopName,
      upiId: row.upiId,
      upiPayeeName: row.upiPayeeName,
      qrImagePath: row.qrImagePath,
      supportPhone: row.supportPhone,
      supportEmail: row.supportEmail,
      termsText: row.termsText,
      showExactStock: row.showExactStock,
      hideOutOfStock: row.hideOutOfStock,
    };
  } catch {
    // Table not migrated yet, or the DB is unreachable — render with defaults.
    return DEFAULT_SETTINGS;
  }
});
