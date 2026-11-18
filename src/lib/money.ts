/**
 * Money helpers. Every amount in this codebase is an INTEGER NUMBER OF PAISE.
 * There are no floats in the money path, on purpose — ₹0.1 + ₹0.2 must never be ₹0.30000000000004.
 *
 * Conventions
 *   - storage: integer paise (₹249.50 -> 24950)
 *   - display: formatINR()
 *   - percentages: decimal strings from the DB ("15.00") are accepted everywhere a pct is taken
 */

const RUPEES_PER_PAISE = 100;

/** Parse a user/CSV supplied rupee amount ("249", "249.5", "₹249.50", "1,249.00") into paise. */
export function rupeesToPaise(input: number | string): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`Invalid amount: ${input}`);
    return Math.round(input * RUPEES_PER_PAISE);
  }
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) {
    throw new Error(`Invalid amount: ${input}`);
  }
  return Math.round(Number(cleaned) * RUPEES_PER_PAISE);
}

export function paiseToRupees(paise: number): number {
  return paise / RUPEES_PER_PAISE;
}

/**
 * Display only. `auto` drops `.00` (₹249), keeps real paise (₹249.50).
 * Uses narrow no-break space so prices wrap as a unit on mobile.
 */
export function formatINR(paise: number, opts: { decimals?: "auto" | 2 | 0; compact?: boolean } = {}): string {
  const decimals = opts.decimals ?? "auto";
  const value = paiseToRupees(paise);
  const fractionDigits = decimals === "auto" ? (paise % RUPEES_PER_PAISE === 0 ? 0 : 2) : decimals;
  const body = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
  return `₹${body}`;
}

/** True when the value has paise (needed for the UPI `am=` parameter). */
export function hasPaise(paise: number): boolean {
  return paise % RUPEES_PER_PAISE !== 0;
}

/** 12.345 -> 12 ; 12.5 -> 13 ; -12.5 -> -12 (half away from zero, i.e. commercial rounding). */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(Math.abs(n)) : Math.round(n + Number.EPSILON);
}

/** `pct` may be a number or a DB decimal string like "15.00". */
export function pctOf(paise: number, pct: number | string): number {
  return roundHalfUp((paise * toNumber(pct)) / 100);
}

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

/**
 * The one place a selling price is derived. Mirrors docs/00-decisions.md D3.
 * A manual override always wins, so an admin can set an odd price without fighting the discount.
 */
export function computeSellPrice(input: {
  mrpPaise: number;
  discountPct: number | string;
  priceOverride?: boolean;
  manualSellPricePaise?: number | null;
}): number {
  if (input.priceOverride && input.manualSellPricePaise != null) {
    return Math.max(0, input.manualSellPricePaise);
  }
  const discounted = input.mrpPaise - pctOf(input.mrpPaise, input.discountPct);
  return Math.max(0, discounted);
}

/** Absolute saving in paise (never negative). */
export function savingPaise(mrpPaise: number, sellPaise: number): number {
  return Math.max(0, mrpPaise - sellPaise);
}

/** Effective discount %, rounded to a whole number for display ("25% off"). */
export function savingPercent(mrpPaise: number, sellPaise: number): number {
  if (mrpPaise <= 0) return 0;
  return roundHalfUp((savingPaise(mrpPaise, sellPaise) * 100) / mrpPaise);
}

/**
 * Split `totalPaise` across weights without losing or inventing a single paisa.
 * Largest-remainder method: floors first, then hands the leftover paise to the biggest fractions
 * (ties broken by index, so the result is deterministic and testable).
 *
 * splitEvenly(1001, [1,1,1,1,1]) -> [201,200,200,200,200]  (sum === 1001)
 */
export function splitEvenly(totalPaise: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) throw new Error("Weights must be non-negative");
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new Error("Weights must not all be zero");

  const exact = weights.map((w) => (totalPaise * w) / weightSum);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = totalPaise - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));

  const result = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] += 1;
    remainder -= 1;
  }
  return result;
}

/** Convenience: equal split among `parts` people. Invariant: sum(result) === total. */
export function splitEqually(totalPaise: number, parts: number): number[] {
  return splitEvenly(
    totalPaise,
    Array.from({ length: parts }, () => 1),
  );
}

/** Sum a list of paise values. Exists so call sites never hand-roll a reduce with floats. */
export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
