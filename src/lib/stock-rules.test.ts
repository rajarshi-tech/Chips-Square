import { describe, expect, it } from "vitest";
import {
  ADJUST_KINDS,
  isAdjustKind,
  resolveMovement,
  StockRuleError,
  wouldGoNegative,
} from "./stock-rules";

describe("resolveMovement", () => {
  it("maps received stock to a PURCHASE movement and keeps the cost", () => {
    expect(resolveMovement({ kind: "RECEIVED", qty: 24, unitCostPaise: 1700 })).toEqual({
      type: "PURCHASE",
      qtyDelta: 24,
      unitCostPaise: 1700,
      noteRequired: false,
      direction: "in",
    });
  });

  it("refuses received stock without a cost, because the settlement needs a cost basis", () => {
    expect(() => resolveMovement({ kind: "RECEIVED", qty: 5 })).toThrow(StockRuleError);
  });

  it("makes outgoing reasons negative without trusting the operator with a minus sign", () => {
    for (const kind of ["DAMAGE", "EXPIRY", "SELF_USE"] as const) {
      const movement = resolveMovement({ kind, qty: 3 });
      expect(movement.type).toBe(kind);
      expect(movement.qtyDelta).toBe(-3);
      expect(movement.noteRequired).toBe(true);
      expect(movement.unitCostPaise).toBeNull();
    }
  });

  it("lets a count fix go either way", () => {
    expect(resolveMovement({ kind: "COUNT_FIX", qty: -2 }).qtyDelta).toBe(-2);
    expect(resolveMovement({ kind: "COUNT_FIX", qty: 4 }).qtyDelta).toBe(4);
    expect(resolveMovement({ kind: "COUNT_FIX", qty: 4 }).noteRequired).toBe(true);
  });

  it("rejects zero, fractional and absurd quantities", () => {
    expect(() => resolveMovement({ kind: "COUNT_FIX", qty: 0 })).toThrow(/not zero/);
    expect(() => resolveMovement({ kind: "COUNT_FIX", qty: 1.5 })).toThrow(/whole number/);
    expect(() => resolveMovement({ kind: "COUNT_FIX", qty: 1_000_000 })).toThrow(/typo/);
  });

  it("rejects a negative quantity typed into an outward reason", () => {
    expect(() => resolveMovement({ kind: "DAMAGE", qty: -3 })).toThrow(/positive/);
  });

  it("rejects negative cost", () => {
    expect(() => resolveMovement({ kind: "RECEIVED", qty: 2, unitCostPaise: -1 })).toThrow(
      /cannot be negative/,
    );
  });

  it("covers every kind, so a new one cannot be added to the type without a rule", () => {
    for (const kind of ADJUST_KINDS) {
      expect(() => resolveMovement({ kind, qty: 1, unitCostPaise: 100 })).not.toThrow();
    }
  });
});

describe("wouldGoNegative", () => {
  it("allows taking exactly what is there", () => {
    expect(wouldGoNegative(3, -3)).toBe(false);
  });

  it("blocks taking more than is there", () => {
    expect(wouldGoNegative(2, -3)).toBe(true);
    expect(wouldGoNegative(0, -1)).toBe(true);
  });

  it("allows adding stock", () => {
    expect(wouldGoNegative(0, 5)).toBe(false);
  });
});

describe("isAdjustKind", () => {
  it("accepts the known kinds and rejects anything else", () => {
    expect(isAdjustKind("RECEIVED")).toBe(true);
    expect(isAdjustKind("SALE")).toBe(false);
    expect(isAdjustKind("")).toBe(false);
  });
});
