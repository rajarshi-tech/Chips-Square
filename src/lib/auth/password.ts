import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's standard library — no dependency, no native build.
 *
 * Stored format (self-describing, so parameters can be raised later without breaking old hashes):
 *
 *   scrypt$N$r$p$<salt base64>$<hash base64>
 *
 * Why scrypt and not bcrypt: it ships with Node. Why not a plain SHA: it is fast, which is exactly
 * wrong for passwords. scrypt is deliberately slow and memory-hard.
 */

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

/** ~50–100 ms per hash on a laptop. Raising N later is safe: old hashes keep their own params. */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verify a password against a stored hash. Returns false for every malformed or unknown input —
 * callers must never distinguish "wrong password" from "no such account" in what they show a user.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  // Length is equal by construction, but guard anyway: timingSafeEqual throws on a mismatch.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * A hash of a throwaway password, used to burn roughly the same CPU time when the account does not
 * exist. Without this, response time leaks which emails are registered.
 */
export const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
