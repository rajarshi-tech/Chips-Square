import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A session token is `base64url(payloadJson).base64url(hmacSha256)`, signed with AUTH_SECRET.
 *
 * Deliberately boring: no JWT library, no key rotation, no refresh tokens. The payload is not
 * encrypted — it holds only a user id and an expiry, and the signature is what prevents forgery.
 *
 * Trade-off, stated plainly: sessions cannot be revoked before they expire except by changing
 * AUTH_SECRET (which signs everyone out) or by the user being deactivated. A 7-day window on a
 * five-person club is acceptable; a 30-day one would not be.
 */

export type SessionPayload = {
  /** users.id */
  sub: string;
  /** expiry, milliseconds since epoch */
  exp: number;
};

const MAX_TOKEN_LENGTH = 512;

function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSessionToken(payload: SessionPayload, secret: string): string {
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Returns the payload only if the signature is valid and the token has not expired.
 * Any malformed input returns null; callers treat null as "signed out".
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(body, secret), "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const { sub, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || sub.length === 0) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp <= now) return null;

  return { sub, exp };
}
