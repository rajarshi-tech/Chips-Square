"use client";

import { useActionState, useState, useTransition } from "react";
import { computeSellPrice, formatINR } from "@/lib/money";
import { lookupBarcodeAction, type ProductFormState } from "./actions";

export type ProductFormValues = {
  id?: string;
  name: string;
  brand: string;
  category: string;
  sizeLabel: string;
  barcode: string;
  mrpRupees: string;
  discountPct: string;
  lowStockThreshold: string;
  description: string;
};

const EMPTY: ProductFormValues = {
  name: "",
  brand: "",
  category: "",
  sizeLabel: "",
  barcode: "",
  mrpRupees: "",
  discountPct: "10",
  lowStockThreshold: "",
  description: "",
};

const initialState: ProductFormState = { error: null };

export function ProductForm({
  action,
  initial,
  categories,
  submitLabel,
}: {
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initial?: ProductFormValues;
  categories: string[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY);
  const [lookup, setLookup] = useState<{ tone: "ok" | "bad" | "busy"; message: string } | null>(null);
  const [looking, startLookup] = useTransition();

  const set = (field: keyof ProductFormValues) => (value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const mrpPaise = Math.round(Number(values.mrpRupees || 0) * 100);
  const sellPaise =
    mrpPaise > 0
      ? computeSellPrice({
          mrpPaise,
          discountPct: values.discountPct || "0",
          priceOverride: false,
          manualSellPricePaise: null,
        })
      : 0;

  function runLookup() {
    if (!values.barcode.trim()) {
      setLookup({ tone: "bad", message: "Type or scan a barcode first." });
      return;
    }
    startLookup(async () => {
      const result = await lookupBarcodeAction(values.barcode);
      if (result.status === "found") {
        setValues((v) => ({
          ...v,
          name: v.name.trim() ? v.name : result.name,
          brand: v.brand.trim() ? v.brand : (result.brand ?? ""),
          sizeLabel: v.sizeLabel.trim() ? v.sizeLabel : (result.size ?? ""),
        }));
        setLookup({ tone: "ok", message: `Found “${result.name}”. Check the details.` });
      } else if (result.status === "error") {
        setLookup({ tone: "bad", message: result.message });
      }
    });
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <fieldset className="space-y-2 rounded-xl border border-black/10 p-4">
        <legend className="px-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Barcode
        </legend>
        <div className="flex gap-2">
          <input
            name="barcode"
            value={values.barcode}
            onChange={(e) => set("barcode")(e.target.value)}
            inputMode="numeric"
            placeholder="Scan or type 8–14 digits"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={runLookup}
            disabled={looking}
            className="shrink-0 rounded-lg border border-black/15 px-3.5 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50"
          >
            {looking ? "Looking…" : "Look up"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Looks the pack up in Open Food Facts and fills in the name. It is crowd-sourced — check it.
        </p>
        {lookup ? (
          <p
            className={`text-xs ${lookup.tone === "bad" ? "text-red-700" : "text-emerald-700"}`}
            role="status"
          >
            {lookup.message}
          </p>
        ) : null}
      </fieldset>

      <Field label="Name" hint="As printed on the pack">
        <input
          name="name"
          required
          value={values.name}
          onChange={(e) => set("name")(e.target.value)}
          className={inputClass}
          placeholder="Classic Salted"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand">
          <input
            name="brand"
            value={values.brand}
            onChange={(e) => set("brand")(e.target.value)}
            className={inputClass}
            placeholder="Lay's"
          />
        </Field>
        <Field label="Size">
          <input
            name="sizeLabel"
            value={values.sizeLabel}
            onChange={(e) => set("sizeLabel")(e.target.value)}
            className={inputClass}
            placeholder="52 g"
          />
        </Field>
      </div>

      <Field label="Category" hint="Free text. Reuse one of these to keep filters tidy.">
        <input
          name="category"
          list="category-options"
          value={values.category}
          onChange={(e) => set("category")(e.target.value)}
          className={inputClass}
          placeholder="Chips"
        />
        <datalist id="category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MRP (₹)" hint="Printed price. Shown struck through.">
          <input
            name="mrpRupees"
            required
            inputMode="decimal"
            value={values.mrpRupees}
            onChange={(e) => set("mrpRupees")(e.target.value)}
            className={inputClass}
            placeholder="20.00"
          />
        </Field>
        <Field label="Discount off MRP (%)" hint="Your price updates below as you type.">
          <input
            name="discountPct"
            inputMode="decimal"
            value={values.discountPct}
            onChange={(e) => set("discountPct")(e.target.value)}
            className={inputClass}
            placeholder="10"
          />
        </Field>
      </div>

      <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-sm">
        {sellPaise > 0 ? (
          <>
            Our price{" "}
            <strong className="font-semibold tabular-nums">{formatINR(sellPaise)}</strong>{" "}
            <span className="text-neutral-500">
              · saves {formatINR(mrpPaise - sellPaise)} off {formatINR(mrpPaise)} MRP
            </span>
          </>
        ) : (
          <span className="text-neutral-500">Enter an MRP to see the selling price.</span>
        )}
      </div>

      <Field
        label="Low-stock warning at"
        hint="Leave blank for no warning. Stock arriving is recorded under Stock, not here."
      >
        <input
          name="lowStockThreshold"
          inputMode="numeric"
          value={values.lowStockThreshold}
          onChange={(e) => set("lowStockThreshold")(e.target.value)}
          className={inputClass}
          placeholder="5"
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea
          name="description"
          rows={2}
          value={values.description}
          onChange={(e) => set("description")(e.target.value)}
          className={inputClass}
          placeholder="Anything worth remembering when restocking"
        />
      </Field>

      {state.error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-black/10 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <span className="text-xs text-neutral-500">
          Stock is never typed here — purchases and sales set it.
        </span>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-base outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
