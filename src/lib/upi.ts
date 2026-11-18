import { paiseToRupees } from "./money";

/**
 * UPI deep links.
 *
 * A UPI URI is a self-identifying payment instruction: amount + payee + note. That is why every
 * reservation gets its own link instead of one static QR — the note (`tn`) carries the order code,
 * which is what makes reconciliation possible at all.
 *
 * Format (NPCI):  upi://pay?pa=<vpa>&pn=<payee>&mc=<mcc>&tr=<ref>&tn=<note>&am=<amount>&cu=INR
 */

export type UpiParams = {
  /** Payee VPA, e.g. chipssquare@upi */
  vpa: string;
  /** Payee display name shown in the payer's app. */
  payeeName: string;
  /** Amount in paise. Converted to a 2-decimal rupee string. */
  amountPaise: number;
  /** Short reference. Most apps show `tn`, and it is capped at ~50 chars. */
  note?: string;
  /** Optional transaction ref echoed back in the statement (useful for manual matching). */
  txnRef?: string;
};

export function buildUpiUri({ vpa, payeeName, amountPaise, note, txnRef }: UpiParams): string {
  if (amountPaise <= 0) throw new Error("UPI amount must be positive");
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: paiseToRupees(amountPaise).toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note.slice(0, 50));
  if (txnRef) params.set("tr", txnRef.slice(0, 35));
  return `upi://pay?${params.toString()}`;
}

/**
 * Build the link for a specific order. The note is the order code, so the payment is attributable
 * without asking the customer anything.
 */
export function buildOrderUpiUri(input: {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  orderCode: string;
}): string {
  return buildUpiUri({
    vpa: input.vpa,
    payeeName: input.payeeName,
    amountPaise: input.amountPaise,
    note: input.orderCode,
    txnRef: input.orderCode,
  });
}

/**
 * Validate a UPI reference (UTR / RRN). Indian UPI references are 12 digits. Customers paste them
 * with spaces and hyphens, so normalise first and store the normalised form.
 */
export function normaliseUtr(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 12) return null;
  return digits;
}

export function looksLikeUtr(raw: string): boolean {
  return normaliseUtr(raw) !== null;
}
