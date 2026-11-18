import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./token";

const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);

function token(overrides: Partial<{ sub: string; exp: number }> = {}, secret = SECRET) {
  return signSessionToken(
    { sub: "11111111-2222-3333-4444-555555555555", exp: Date.now() + 60_000, ...overrides },
    secret,
  );
}

describe("signSessionToken / verifySessionToken", () => {
  it("round-trips a payload", () => {
    const t = token();
    const payload = verifySessionToken(t, SECRET);
    expect(payload?.sub).toBe("11111111-2222-3333-4444-555555555555");
    expect(payload?.exp).toBeGreaterThan(Date.now());
  });

  it("rejects a token signed with a different secret", () => {
    expect(verifySessionToken(token({}, OTHER_SECRET), SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [body, sig] = token().split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "99999999-0000-0000-0000-000000000000", exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(forged).not.toBe(body);
    expect(verifySessionToken(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expired = token({ exp: Date.now() - 1 });
    expect(verifySessionToken(expired, SECRET)).toBeNull();
  });

  it("treats a token expiring exactly now as expired", () => {
    const now = Date.now();
    expect(verifySessionToken(token({ exp: now }), SECRET, now)).toBeNull();
  });

  it("returns null for empty, truncated and malformed input", () => {
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
    expect(verifySessionToken(null, SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("no-dot-here", SECRET)).toBeNull();
    expect(verifySessionToken(".", SECRET)).toBeNull();
    expect(verifySessionToken("body.", SECRET)).toBeNull();
    expect(verifySessionToken(".sig", SECRET)).toBeNull();
    expect(verifySessionToken("a.b", SECRET)).toBeNull();
  });

  it("rejects an oversized token before doing crypto work", () => {
    expect(verifySessionToken("x".repeat(600), SECRET)).toBeNull();
  });

  it("rejects a payload whose sub is not a non-empty string", () => {
    const body = Buffer.from(JSON.stringify({ sub: "", exp: Date.now() + 60_000 })).toString(
      "base64url",
    );
    const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifySessionToken(`${body}.${sig}`, SECRET)).toBeNull();
  });
});
