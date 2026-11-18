import { describe, expect, it } from "vitest";
import { buildOrderUpiUri, buildUpiUri, looksLikeUtr, normaliseUtr } from "./upi";

const base = { vpa: "chipssquare@upi", payeeName: "Chips Square" };

describe("buildUpiUri", () => {
  it("builds a spec-shaped intent with a 2-decimal amount", () => {
    const uri = buildUpiUri({ ...base, amountPaise: 24950, note: "CS-8F3K2" });
    const url = new URL(uri.replace("upi://", "https://"));
    expect(url.searchParams.get("pa")).toBe("chipssquare@upi");
    expect(url.searchParams.get("pn")).toBe("Chips Square");
    expect(url.searchParams.get("am")).toBe("249.50");
    expect(url.searchParams.get("cu")).toBe("INR");
    expect(url.searchParams.get("tn")).toBe("CS-8F3K2");
  });

  it("url-encodes the payee name", () => {
    const uri = buildUpiUri({ vpa: "a@b", payeeName: "Chips & Square", amountPaise: 100 });
    expect(uri).toContain("pn=Chips+%26+Square");
  });

  it("truncates the note to the app limit", () => {
    const uri = buildUpiUri({ ...base, amountPaise: 100, note: "x".repeat(80) });
    const url = new URL(uri.replace("upi://", "https://"));
    expect(url.searchParams.get("tn")!.length).toBe(50);
  });

  it("rejects a non-positive amount", () => {
    expect(() => buildUpiUri({ ...base, amountPaise: 0 })).toThrow();
    expect(() => buildUpiUri({ ...base, amountPaise: -5 })).toThrow();
  });
});

describe("buildOrderUpiUri", () => {
  it("puts the order code in both the note and the txn ref", () => {
    const uri = buildOrderUpiUri({ ...base, amountPaise: 10000, orderCode: "CS-ABC123" });
    const url = new URL(uri.replace("upi://", "https://"));
    expect(url.searchParams.get("tn")).toBe("CS-ABC123");
    expect(url.searchParams.get("tr")).toBe("CS-ABC123");
  });
});

describe("UTR handling", () => {
  it("normalises spacing and hyphens", () => {
    expect(normaliseUtr("4312 8891 0021")).toBe("431288910021");
    expect(normaliseUtr("4312-8891-0021")).toBe("431288910021");
    expect(normaliseUtr("431288910021")).toBe("431288910021");
  });

  it("rejects the wrong length", () => {
    expect(normaliseUtr("12345")).toBeNull();
    expect(looksLikeUtr("43128891002")).toBe(false);
    expect(looksLikeUtr("abc")).toBe(false);
    expect(looksLikeUtr("4312 8891 0021")).toBe(true);
  });
});
