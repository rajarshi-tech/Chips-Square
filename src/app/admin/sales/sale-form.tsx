"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { formatINR } from "@/lib/money";
import {
  createSaleAction,
  searchProductsAction,
  type SaleFormState,
  type SellableMatch,
} from "./actions";

type Line = { id: string; name: string; qty: number; unitPriceRupees: string; onHand: number };

const initialState: SaleFormState = { error: null };

export function SaleForm() {
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SellableMatch[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);

  const totalPaise = useMemo(
    () => lines.reduce((sum, l) => sum + Math.round(Number(l.unitPriceRupees || 0) * 100) * l.qty, 0),
    [lines],
  );
  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  function search(text: string) {
    setQuery(text);
    startSearch(async () => {
      setMatches(await searchProductsAction(text));
    });
  }

  function addProduct(match: SellableMatch) {
    setLines((current) => {
      const existing = current.find((l) => l.id === match.id);
      if (existing) {
        return current.map((l) =>
          l.id === match.id ? { ...l, qty: Math.min(l.qty + 1, match.onHand) } : l,
        );
      }
      return [
        ...current,
        {
          id: match.id,
          name: match.name,
          qty: 1,
          unitPriceRupees: (match.sellPaise / 100).toFixed(2),
          onHand: match.onHand,
        },
      ];
    });
    setMatches(null);
    setQuery("");
  }

  function setQty(id: string, qty: number) {
    setLines((current) =>
      current.map((l) => (l.id === id ? { ...l, qty: Math.min(Math.max(1, qty), l.onHand) } : l)),
    );
  }

  function setPrice(id: string, value: string) {
    setLines((current) => current.map((l) => (l.id === id ? { ...l, unitPriceRupees: value } : l)));
  }

  function remove(id: string) {
    setLines((current) => current.filter((l) => l.id !== id));
  }

  const payload = JSON.stringify(
    lines.map((l) => ({
      productId: l.id,
      qty: l.qty,
      unitPricePaise: Math.round(Number(l.unitPriceRupees || 0) * 100),
    })),
  );

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <input type="hidden" name="lines" value={payload} />

      <div className="rounded-xl border border-black/10 p-4">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Find a product</span>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Name, brand or barcode"
            autoFocus
            className={input}
          />
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          {searching ? "Searching…" : "Only what is actually on the shelf is listed."}
        </p>

        {matches && matches.length > 0 ? (
          <ul className="mt-2 divide-y divide-black/5">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => addProduct(m)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-black/[0.03]"
                >
                  <span className="min-w-0 truncate">
                    {m.name}
                    {m.sizeLabel ? (
                      <span className="text-neutral-500"> · {m.sizeLabel}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                    {formatINR(m.sellPaise)} · {m.onHand} left
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {matches && matches.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Nothing matches. Check the spelling, or add the product first.
          </p>
        ) : null}
      </div>

      <section className="rounded-xl border border-black/10 p-4">
        <h2 className="text-sm font-semibold">In this sale</h2>
        {lines.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing added yet.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-end gap-2 border-b border-black/5 pb-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-medium">{line.name}</span>
                  <span className="text-xs text-neutral-500">{line.onHand} available</span>
                </span>

                <label className="w-16 shrink-0">
                  <span className="block text-[11px] text-neutral-500">Qty</span>
                  <input
                    type="number"
                    min={1}
                    max={line.onHand}
                    value={line.qty}
                    onChange={(e) => setQty(line.id, Number(e.target.value))}
                    className={`${input} px-2 py-1.5 text-sm`}
                  />
                </label>

                <label className="w-24 shrink-0">
                  <span className="block text-[11px] text-neutral-500">Price ₹</span>
                  <input
                    inputMode="decimal"
                    value={line.unitPriceRupees}
                    onChange={(e) => setPrice(line.id, e.target.value)}
                    className={`${input} px-2 py-1.5 text-sm`}
                  />
                </label>

                <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatINR(Math.round(Number(line.unitPriceRupees || 0) * 100) * line.qty)}
                </span>

                <button
                  type="button"
                  onClick={() => remove(line.id)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-black/10 pt-3">
          <span className="text-sm text-neutral-500">
            {units} {units === 1 ? "unit" : "units"}
          </span>
          <span className="text-lg font-semibold tabular-nums">{formatINR(totalPaise)}</span>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Paid by</span>
          <select name="method" defaultValue="CASH" className={input}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Buyer (optional)</span>
          <input name="buyerName" placeholder="Priya, 3rd floor" className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Note (optional)</span>
          <input name="note" placeholder="Paid later" className={input} />
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-black/10 pt-4">
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {pending ? "Recording…" : "Record sale"}
        </button>
        <span className="text-xs text-neutral-500">
          Stock comes off the shelf and the shelf count updates immediately.
        </span>
      </div>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10";