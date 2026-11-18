/**
 * What a manual stock adjustment is allowed to be.
 *
 * The ledger only understands movements, so the UI's friendlier words are mapped here, in one place,
 * with the rules that make each one honest:
 *
 *   Received   → PURCHASE   (+qty, cost required)  — units arriving with a known price
 *   Damaged    → DAMAGE     (−qty, note required)
 *   Expired    → EXPIRY     (−qty, note required)
 *   Self-use   → SELF_USE   (−qty, note required)
 *   Count fix  → ADJUSTMENT (±qty, note required)  — the shelf disagreed with the books
 *
 * Deliberately absent: a plain "add stock" with no reason and no cost. That is how a ledger stops
 * explaining itself, and the average cost — and therefore the settlement — silently goes wrong.
 */

export const ADJUST_KINDS = ["RECEIVED", "DAMAGE", "EXPIRY", "SELF_USE", "COUNT_FIX"] as const;
export type AdjustKind = (typeof ADJUST_KINDS)[number];

export type MovementType = "PURCHASE" | "SALE" | "RETURN" | "DAMAGE" | "EXPIRY" | "SELF_USE" | "ADJUSTMENT";

export type ResolvedMovement = {
  type: MovementType;
  qtyDelta: number;
  unitCostPaise: number | null;
  noteRequired: boolean;
  /** Shown in the form so the effect is never a surprise. */
  direction: "in" | "out" | "either";
};

export class StockRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRuleError";
  }
}

export function isAdjustKind(value: string): value is AdjustKind {
  return (ADJUST_KINDS as readonly string[]).includes(value);
}

/**
 * Turn a form choice into the movement that will be written.
 * `qty` is always positive in the UI; the sign is applied here so it cannot be got wrong by hand.
 */
export function resolveMovement(input: {
  kind: AdjustKind;
  qty: number;
  unitCostPaise?: number | null;
}): ResolvedMovement {
  const { kind, qty } = input;

  if (!Number.isInteger(qty) || qty === 0) {
    throw new StockRuleError("Quantity must be a whole number, and not zero");
  }
  if (Math.abs(qty) > 100_000) {
    throw new StockRuleError("That quantity looks like a typo");
  }

  switch (kind) {
    case "RECEIVED": {
      if (qty < 0) throw new StockRuleError("Received quantity must be positive");
      if (input.unitCostPaise == null || !Number.isInteger(input.unitCostPaise)) {
        throw new StockRuleError("Received stock needs a cost per unit");
      }
      if (input.unitCostPaise < 0) throw new StockRuleError("Cost per unit cannot be negative");
      return {
        type: "PURCHASE",
        qtyDelta: qty,
        unitCostPaise: input.unitCostPaise,
        noteRequired: false,
        direction: "in",
      };
    }

    case "DAMAGE":
    case "EXPIRY":
    case "SELF_USE": {
      if (qty < 0) throw new StockRuleError("Enter the number of units leaving, as a positive number");
      return {
        type: kind,
        qtyDelta: -qty,
        unitCostPaise: null,
        noteRequired: true,
        direction: "out",
      };
    }

    case "COUNT_FIX":
      return {
        type: "ADJUSTMENT",
        qtyDelta: qty,
        unitCostPaise: null,
        noteRequired: true,
        direction: "either",
      };
  }
}

/** True when this movement would push the shelf below zero. */
export function wouldGoNegative(onHand: number, qtyDelta: number): boolean {
  return onHand + qtyDelta < 0;
}
