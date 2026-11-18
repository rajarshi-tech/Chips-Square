import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("produces a self-describing scrypt string", async () => {
    const hash = await hashPassword("correct horse battery");
    const [algo, N, r, p] = hash.split("$");
    expect(algo).toBe("scrypt");
    expect(Number(N)).toBe(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(hash.split("$")).toHaveLength(6);
  });

  it("salts every hash, so the same password hashes differently", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("refuses short passwords instead of silently accepting them", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("chips-square-2026");
    expect(await verifyPassword("chips-square-2026", hash)).toBe(true);
    expect(await verifyPassword("chips-square-2025", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("treats a null hash as 'cannot sign in'", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
  });

  it("returns false for malformed or tampered hashes rather than throwing", async () => {
    const hash = await hashPassword("chips-square-2026");
    const parts = hash.split("$");

    expect(await verifyPassword("chips-square-2026", "garbage")).toBe(false);
    expect(await verifyPassword("chips-square-2026", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("chips-square-2026", parts.slice(0, 5).join("$"))).toBe(false);

    const tamperedHash = [...parts];
    tamperedHash[5] = Buffer.from("not the real hash").toString("base64");
    expect(await verifyPassword("chips-square-2026", tamperedHash.join("$"))).toBe(false);

    const tamperedSalt = [...parts];
    tamperedSalt[4] = Buffer.from("different salt").toString("base64");
    expect(await verifyPassword("chips-square-2026", tamperedSalt.join("$"))).toBe(false);
  });

  it("never matches the dummy hash used for unknown accounts", async () => {
    expect(await verifyPassword("anything at all", DUMMY_HASH)).toBe(false);
  });
});
