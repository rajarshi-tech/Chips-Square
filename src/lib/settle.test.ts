import { describe, expect, it } from "vitest";
import { computeProfit, equalSharePct } from "./settle";
import { splitEvenly } from "./money";

describe("computeProfit", () => {
  it("is revenue minus cogs minus expenses", () => {
    expect(computeProfit({ revenuePaise: 42530, cogsPaise: 37650, expensesPaise: 1500 })).toEqual({
      profitPaise: 3380,
      distributablePaise: 3380,
    });
  });

  it("distributes nothing when the cycle loses money", () => {
    const loss = computeProfit({ revenuePaise: 10_000, cogsPaise: 20_000, expensesPaise: 500 });
    expect(loss.profitPaise).toBe(-10_500);
    expect(loss.distributablePaise).toBe(0);
  });

  it("never distributes more than the profit, even by a paisa", () => {
    const { profitPaise, distributablePaise } = computeProfit({
      revenuePaise: 100_001,
      cogsPaise: 0,
      expensesPaise: 0,
    });
    expect(distributablePaise).toBe(profitPaise);
    const shares = splitEvenly(distributablePaise, [1, 1, 1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(profitPaise);
  });

  it("is exact when revenue equals costs", () => {
    expect(computeProfit({ revenuePaise: 5000, cogsPaise: 4000, expensesPaise: 1000 })).toEqual({
      profitPaise: 0,
      distributablePaise: 0,
    });
  });
});

describe("equalSharePct", () => {
  it("gives clean percentages for five partners", () => {
    expect(equalSharePct(5)).toBe("20.00");
    expect(equalSharePct(4)).toBe("25.00");
  });

  it("rounds thirds to two decimals", () => {
    expect(equalSharePct(3)).toBe("33.33");
  });

  it("survives a club with no partners", () => {
    expect(equalSharePct(0)).toBe("0.00");
  });
});
