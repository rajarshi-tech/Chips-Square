"use client";

import { useActionState, useState } from "react";
import { ADJUST_KINDS, type AdjustKind } from "@/lib/stock-rules";
import { adjustStockAction, type AdjustState } from "./actions";

const initialState: AdjustState = { error: null };

const KIND_LABEL: Record<AdjustKind, string> = {
  RECEIVED: "Received — stock in",
  DAMAGE: "Damaged — stock out",
  EXPIRY: "Expired — stock out",
  SELF_USE: "Self-use (partners) — stock out",
  COUNT_FIX: "Count fix — shelf disagreed with the books",
};

const KIND_HINT: Record<AdjustKind, string> = {
  RECEIVED: "Units arrived. Enter what you paid per unit so the stock keeps a cost basis.",
  DAMAGE: "Torn, crushed or spoiled. The note is what explains it later.",
  EXPIRY: "Past its date and out of the shop.",
  SELF_USE: "A partner took it. It still leaves the stock, it just does not earn.",
  COUNT_FIX: "Use a negative number for more than the books say, positive for fewer.",
};

export function AdjustForm({ productId, onHand }: { productId: string; onHand: number }) {
  const [state, formAction, pending] = useActionState(adjustStockAction, initialState);
  const [kind, setKind] = useState<AdjustKind>("RECEIVED");

  const needsCost = kind === "RECEIVED";
  const needsNote = kind !== "RECEIVED";

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-black/10 p-4">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <h2 className="text-sm font-semibold">Adjust stock</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {onHand} on the shelf now. {KIND_HINT[kind]}
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium">Reason</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AdjustKind)}
          className={input}
        >
          {ADJUST_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">
            {kind === "COUNT_FIX" ? "Units (+ or −)" : "Units"}
          </span>
          <input
            name="qty"
            inputMode="numeric"
            required
            placeholder={kind === "COUNT_FIX" ? "-2" : "24"}
            className={input}
          />
        </label>

        {needsCost ? (
          <label className="block space-y-1.5">
            <span className="block text-xs font-medium">Cost per unit (₹)</span>
            <input
              name="costRupees"
              inputMode="decimal"
              required
              placeholder="17.00"
              className={input}
            />
          </label>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>

      <label className="block space-y-1.5">
        <span className="block text-xs font-medium">
          Note {needsNote ? <span className="text-red-600">(required)</span> : "(optional)"}
        </span>
        <textarea
          name="note"
          rows={2}
          required={needsNote}
          placeholder={
            needsNote ? "e.g. 3 packs crushed under a crate" : "e.g. Blinkit order, 2 Aug"
          }
          className={input}
        />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {state.done ? (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.done.qtyDelta > 0 ? "Added" : "Removed"} {Math.abs(state.done.qtyDelta)} ·{" "}
          {state.done.onHand} on the shelf now.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record movement"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10";
