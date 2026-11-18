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
  holdTtlMinutes: number;
  maxActiveHoldsPerUser: number;
  scarceThreshold: number;
  noShowLimit: number;
  cooldownDays: number;
  unclaimedCancelDays: number;
  showExactStock: boolean;
};

export const DEFAULT_SETTINGS: SettingsDto = {
  shopName: "Chips Square",
  upiId: "chipssquare@upi",
  upiPayeeName: "Chips Square",
  qrImagePath: null,
  supportPhone: null,
  supportEmail: null,
  termsText: null,
  holdTtlMinutes: 12,
  maxActiveHoldsPerUser: 2,
  scarceThreshold: 5,
  noShowLimit: 2,
  cooldownDays: 7,
  unclaimedCancelDays: 7,
  showExactStock: true,
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
      holdTtlMinutes: row.holdTtlMinutes,
      maxActiveHoldsPerUser: row.maxActiveHoldsPerUser,
      scarceThreshold: row.scarceThreshold,
      noShowLimit: row.noShowLimit,
      cooldownDays: row.cooldownDays,
      unclaimedCancelDays: row.unclaimedCancelDays,
      showExactStock: row.showExactStock,
    };
  } catch {
    // Table not migrated yet, or the DB is unreachable — render with defaults.
    return DEFAULT_SETTINGS;
  }
});
