"use client";

import { useActionState, useMemo, useState } from "react";
import { formatINR, tryRupeesToPaise } from "@/lib/money";
import type { SellableProduct } from "@/lib/queries/sellable";
import { createSaleAction, type SaleFormState } from "./actions";

/**
 * The counter form. Deliberately built the way a person actually works a counter: the whole shelf
 * is on screen as tiles, one tap adds one pack, and the basket sits beside it. No typing, no
 * searching, no scrolling a dropdown while a customer waits.
 *
 * Prices on a line are editable, because the sticker price is not always what was charged. The
 * difference is captured by `createSale` as `discountPaise` on the sale row.
 */

type Line = {
  id: string;
  name: string;
  sizeLabel: string | null;
  onHand: number;
  qty: number;
  /** Rupees as typed, so a half-finished "24." does not get rounded behind the admin's back. */
  price: string;
  shelfPaise: number;
};

const initialState: SaleFormState = { error: null };

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank" },
] as const;

const priceInput = (paise: number) => String(paise / 100);

export function SaleForm({ products }: { products: SellableProduct[] }) {
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const [lines, setLines] = useState<Line[]>([]);
  const [filter, setFilter] = useState("");
  const [method, setMethod] = useState<string>("CASH");

  const priced = useMemo(
    () => lines.map((l) => ({ ...l, unitPaise: tryRupeesToPaise(l.price) })),
    [lines],
  );
  const totalPaise = priced.reduce((sum, l) => sum + (l.unitPaise ?? 0) * l.qty, 0);
  const units = priced.reduce((sum, l) => sum + l.qty, 0);
  const badPrice = priced.some((l) => l.unitPaise === null);
  const qtyOf = useMemo(() => new Map(lines.map((l) => [l.id, l.qty])), [lines]);

  const needle = filter.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return products;
    return products.filter((p) =>
      [p.name, p.brand, p.sizeLabel, p.barcode].some((v) => v?.toLowerCase().includes(needle)),
    );
  }, [products, needle]);

  function add(product: SellableProduct) {
    setLines((current) => {
      const found = current.find((l) => l.id === product.id);
      if (found) {
        // The shelf count is the ceiling, not a warning shown after the fact.
        if (found.qty >= product.onHand) return current;
        return current.map((l) => (l.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          sizeLabel: product.sizeLabel,
          onHand: product.onHand,
          qty: 1,
          price: priceInput(product.sellPaise),
          shelfPaise: product.sellPaise,
        },
      ];
    });
  }

  function setQty(id: string, qty: number) {
    setLines((current) =>
      current
        .map((l) => (l.id === id ? { ...l, qty: Math.min(Math.max(0, qty), l.onHand) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function setPrice(id: string, value: string) {
    setLines((current) => current.map((l) => (l.id === id ? { ...l, price: value } : l)));
  }

  const payload = JSON.stringify(
    priced.map((l) => ({
      productId: l.id,
      qty: l.qty,
      unitPricePaise: l.unitPaise,
    })),
  );

  const canSubmit = !pending && lines.length > 0 && !badPrice;

  return (
    <form action={formAction} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <input type="hidden" name="lines" value={payload} />

      {/* ---------------- the shelf ---------------- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Filter the shelf</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                // A barcode scanner types the code and hits Enter: one match means that is the pack.
                if (visible.length === 1) {
                  add(visible[0]);
                  setFilter("");
                }
              }}
              placeholder="Filter by name, brand or barcode"
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
            />
          </label>
          {needle ? (
            <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
              {visible.length} of {products.length}
            </span>
          ) : null}
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500">
            Nothing on the shelf yet. Receive stock first, then come back.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-neutral-500">
            No pack matches “{filter.trim()}”.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const qty = qtyOf.get(p.id) ?? 0;
              const atMax = qty >= p.onHand;
              return (
                <li key={p.id} className="relative">
                  <button
                    type="button"
                    onClick={() => add(p)}
                    disabled={atMax}
                    aria-label={`Add one ${p.name}${p.sizeLabel ? ` ${p.sizeLabel}` : ""} to the sale`}
                    className="flex h-full w-full flex-col justify-between gap-2 rounded-xl border border-black/10 bg-white p-3 pr-14 text-left transition hover:border-black/30 hover:bg-black/[0.02] focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none active:bg-black/[0.04] disabled:cursor-default disabled:opacity-60 disabled:hover:border-black/10 disabled:hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-medium tracking-wide text-neutral-500 uppercase">
                        {p.brand ?? "—"}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm leading-snug font-medium">
                        {p.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500">
                        {p.sizeLabel ?? ""}
                      </span>
                    </span>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatINR(p.sellPaise)}
                      </span>
                      <span className="text-[11px] text-neutral-500 tabular-nums">
                        {atMax ? "max" : `${p.onHand} left`}
                      </span>
                    </span>
                  </button>

                  {qty > 0 ? (
                    <span className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(p.id, qty - 1)}
                        aria-label={`Take one ${p.name} out of the sale`}
                        className="grid size-7 place-items-center rounded-full bg-white text-base leading-none ring-1 ring-black/20 transition hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
                      >
                        −
                      </button>
                      <span className="grid size-7 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white tabular-nums">
                        {qty}
                      </span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---------------- the basket ---------------- */}
      <aside id="sale-cart" className="space-y-3 lg:sticky lg:top-6">
        <section className="rounded-xl border border-black/10 bg-white">
          <header className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <h2 className="text-sm font-semibold">
              This sale
              {units > 0 ? <span className="font-normal text-neutral-500"> · {units} units</span> : null}
            </h2>
            {lines.length > 0 ? (
              <button
                type="button"
                onClick={() => setLines([])}
                className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
              >
                Clear
              </button>
            ) : null}
          </header>

          {lines.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">
              Tap a pack on the left. It lands here.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {priced.map((line) => {
                const changed = line.unitPaise !== null && line.unitPaise !== line.shelfPaise;
                return (
                  <li key={line.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{line.name}</span>
                        <span className="block text-xs text-neutral-500">
                          {line.sizeLabel ?? ""}
                          {line.onHand <= line.qty ? " · all of it" : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {line.unitPaise === null ? "—" : formatINR(line.unitPaise * line.qty)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-lg ring-1 ring-black/15">
                        <button
                          type="button"
                          onClick={() => setQty(line.id, line.qty - 1)}
                          aria-label={`One less ${line.name}`}
                          className="grid size-8 place-items-center rounded-l-lg text-base leading-none text-neutral-600 transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm tabular-nums">{line.qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(line.id, line.qty + 1)}
                          disabled={line.qty >= line.onHand}
                          aria-label={`One more ${line.name}`}
                          className="grid size-8 place-items-center rounded-r-lg text-base leading-none text-neutral-600 transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          +
                        </button>
                      </div>

                      <label
                        className={`flex items-center gap-1 rounded-lg px-2 py-1 ring-1 ${
                          line.unitPaise === null ? "ring-red-400" : "ring-black/15"
                        }`}
                      >
                        <span className="text-xs text-neutral-500">₹</span>
                        <input
                          value={line.price}
                          onChange={(e) => setPrice(line.id, e.target.value)}
                          inputMode="decimal"
                          aria-label={`Price charged per unit for ${line.name}`}
                          className="w-14 bg-transparent text-sm tabular-nums outline-none"
                        />
                      </label>

                      {changed ? (
                        <button
                          type="button"
                          onClick={() => setPrice(line.id, priceInput(line.shelfPaise))}
                          title="Put the shelf price back"
                          className="rounded-md px-1.5 py-1 text-[11px] text-amber-700 transition hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none"
                        >
                          was {formatINR(line.shelfPaise)}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-black/10 px-4 py-3">
            <span className="text-sm text-neutral-500">{units} units</span>
            <span className="text-lg font-semibold tabular-nums">{formatINR(totalPaise)}</span>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-black/10 bg-white p-4">
          <div>
            <span className="block text-xs font-medium">Paid by</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <label key={m.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="method"
                    value={m.value}
                    checked={method === m.value}
                    onChange={() => setMethod(m.value)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-lg px-2 py-2 text-center text-xs font-medium ring-1 ring-black/15 transition peer-checked:bg-neutral-900 peer-checked:text-white peer-checked:ring-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-black/50">
                    {m.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="block text-xs font-medium">Buyer (optional)</span>
            <input
              name="buyerName"
              placeholder="Priya, 3rd floor"
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium">Note (optional)</span>
            <input
              name="note"
              placeholder="Price cut to clear stock"
              className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
            />
          </label>

          {state.error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}
          {badPrice ? (
            <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              One of the prices is not a valid amount.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-black/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40"
          >
            {pending ? "Recording…" : `Record sale${totalPaise > 0 ? ` · ${formatINR(totalPaise)}` : ""}`}
          </button>
          <p className="text-[11px] leading-relaxed text-neutral-500">
            Units come off the shelf and the public count updates immediately. A mistake is voided
            on the day book, never deleted.
          </p>
        </section>
      </aside>

      {/* Phone-friendly: keep the total and the button in reach while the grid scrolls. */}
      {lines.length > 0 ? (
        <div className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-black/10 bg-white/95 px-5 py-3 backdrop-blur lg:hidden">
          <a href="#sale-cart" className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tabular-nums">{formatINR(totalPaise)}</span>
            <span className="block text-xs text-neutral-500">
              {units} units · review
            </span>
          </a>
          <button
            type="submit"
            disabled={!canSubmit}
            className="shrink-0 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-40"
          >
            {pending ? "Recording…" : "Record sale"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
