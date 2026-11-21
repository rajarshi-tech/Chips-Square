import { describe, expect, it } from "vitest";
import {
  computeSellPrice,
  formatINR,
  hasPaise,
  paiseToRupees,
  pctOf,
  roundHalfUp,
  rupeesToPaise,
  savingPaise,
  savingPercent,
  splitEqually,
  splitEvenly,
  tryRupeesToPaise,
} from "./money";

describe("rupeesToPaise", () => {
  it("parses the shapes a human or CSV produces", () => {
    expect(rupeesToPaise("249")).toBe(24900);
    expect(rupeesToPaise("249.5")).toBe(24950);
    expect(rupeesToPaise("₹1,249.00")).toBe(124900);
    expect(rupeesToPaise(249.5)).toBe(24950);
    expect(rupeesToPaise(" 20 ")).toBe(2000);
  });

  it("rounds to the nearest paisa instead of truncating", () => {
    expect(rupeesToPaise("0.005")).toBe(1);
    expect(rupeesToPaise(249.999)).toBe(25000);
  });

  it("rejects junk", () => {
    expect(() => rupeesToPaise("abc")).toThrow();
    expect(() => rupeesToPaise("")).toThrow();
    expect(() => rupeesToPaise(Number.NaN)).toThrow();
  });
});

describe("tryRupeesToPaise", () => {
  it("parses what an admin types into the price box", () => {
    expect(tryRupeesToPaise("249")).toBe(24900);
    expect(tryRupeesToPaise("₹249.50")).toBe(24950);
    expect(tryRupeesToPaise("1,249")).toBe(124900);
    expect(tryRupeesToPaise("0")).toBe(0);
  });

  it("returns null while the value is still incomplete, instead of throwing mid-keystroke", () => {
    expect(tryRupeesToPaise("")).toBeNull();
    expect(tryRupeesToPaise("24.")).toBeNull();
    expect(tryRupeesToPaise("abc")).toBeNull();
    expect(tryRupeesToPaise("12.345")).toBeNull();
    expect(tryRupeesToPaise("-12")).toBeNull();
  });
});

describe("formatINR", () => {
  it("drops .00 but keeps real paise", () => {
    expect(formatINR(24900)).toBe("₹249");
    expect(formatINR(24950)).toBe("₹249.50");
    expect(formatINR(124900)).toBe("₹1,249");
  });

  it("honours explicit decimals", () => {
    expect(formatINR(24900, { decimals: 2 })).toBe("₹249.00");
    expect(formatINR(24950, { decimals: 0 })).toBe("₹250");
  });
});

describe("rounding helpers", () => {
  it("rounds half away from zero", () => {
    expect(roundHalfUp(12.4)).toBe(12);
    expect(roundHalfUp(12.5)).toBe(13);
    expect(roundHalfUp(-12.5)).toBe(-13);
  });

  it("takes a percentage of paise with integers only", () => {
    expect(pctOf(24900, 15)).toBe(3735);
    expect(pctOf(24900, "15.00")).toBe(3735);
    expect(pctOf(19900, 12.5)).toBe(2488); // 2487.5 -> 2488
    expect(Number.isInteger(pctOf(19900, 12.5))).toBe(true);
  });
});

describe("computeSellPrice", () => {
  it("applies discount off MRP", () => {
    expect(computeSellPrice({ mrpPaise: 24900, discountPct: 20 })).toBe(19920);
  });

  it("prefers a manual override", () => {
    expect(
      computeSellPrice({
        mrpPaise: 24900,
        discountPct: 20,
        priceOverride: true,
        manualSellPricePaise: 17900,
      }),
    ).toBe(17900);
  });

  it("ignores the override when the flag is off", () => {
    expect(
      computeSellPrice({
        mrpPaise: 10000,
        discountPct: 10,
        priceOverride: false,
        manualSellPricePaise: 1,
      }),
    ).toBe(9000);
  });

  it("never returns a negative price", () => {
    expect(computeSellPrice({ mrpPaise: 10000, discountPct: 150 })).toBe(0);
  });
});

describe("savings display", () => {
  it("computes savings and percent", () => {
    expect(savingPaise(24900, 19920)).toBe(4980);
    expect(savingPercent(24900, 19920)).toBe(20);
    expect(savingPercent(10000, 33300)).toBe(0);
    expect(savingPercent(0, 100)).toBe(0);
  });
});

describe("splitEvenly (largest remainder)", () => {
  it("distributes every paisa when it does not divide evenly", () => {
    const shares = splitEqually(1001, 5);
    expect(shares).toEqual([201, 200, 200, 200, 200]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it("handles an even split", () => {
    expect(splitEqually(50000, 5)).toEqual([10000, 10000, 10000, 10000, 10000]);
  });

  it("supports unequal weights (partner added later)", () => {
    const shares = splitEvenly(100000, [3, 3, 2, 2]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(shares).toEqual([30000, 30000, 20000, 20000]);
  });

  it("never loses paise for awkward numbers", () => {
    for (const total of [1, 7, 999, 123457, 5]) {
      for (const parts of [1, 2, 3, 5, 6, 7]) {
        const shares = splitEqually(total, parts);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(shares.every((s) => Number.isInteger(s))).toBe(true);
      }
    }
  });

  it("rejects impossible inputs", () => {
    expect(() => splitEvenly(100, [])).toEqual(expect.anything());
    expect(() => splitEvenly(100, [0, 0])).toThrow();
    expect(() => splitEvenly(100, [-1, 2])).toThrow();
  });
});

describe("hasPaise", () => {
  it("detects whether the UPI amount needs decimals", () => {
    expect(hasPaise(24950)).toBe(true);
    expect(hasPaise(24900)).toBe(false);
    expect(paiseToRupees(24950)).toBe(249.5);
  });
});
