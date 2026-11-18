import { randomBytes } from "node:crypto";

/**
 * Human-facing identifiers.
 *
 * Order codes appear in UPI notes and on a customer's phone, so they avoid ambiguous characters
 * (no 0/O, 1/I/L) and are short enough to read aloud over the counter.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** e.g. CS-8F3K2M */
export function newOrderCode(): string {
  return `CS-${randomCode(6)}`;
}

/** 4-digit pickup code, shown after payment and typed by staff at the counter. */
export function newPickupCode(): string {
  return String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));
}

/**
 * URL slug. Kept deterministic so the same product name always yields the same slug
 * (collisions are resolved by appending -2, -3 in the product form).
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Normalise a product identity for duplicate detection: brand + name + size, ignoring case,
 * spaces and punctuation. Mirrors the unique index in the catalog schema.
 */
export function productIdentity(brand: string | null, name: string, sizeLabel: string | null): string {
  const part = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return [part(brand), part(name), part(sizeLabel)].join("|");
}
