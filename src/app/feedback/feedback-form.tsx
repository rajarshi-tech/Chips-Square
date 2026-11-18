"use client";

import { useActionState, useState } from "react";
import { submitFeedback, type FeedbackState } from "./actions";

const TYPES = [
  { value: "ITEM_REQUEST", label: "Stock this item" },
  { value: "SUGGESTION", label: "Suggestion" },
  { value: "COMPLAINT", label: "Complaint" },
  { value: "BUG", label: "Something is broken" },
] as const;

const initialState: FeedbackState = { status: "idle" };

export function FeedbackForm() {
  const [state, formAction, pending] = useActionState(submitFeedback, initialState);
  const [type, setType] = useState<string>("ITEM_REQUEST");

  if (state.status === "ok") {
    return (
      <div className="rounded-2xl border border-ok/25 bg-ok-soft p-6">
        <p className="text-sm font-medium text-ok">Got it.</p>
        <p className="mt-1 text-sm text-ink-soft">{state.message}</p>
        <p className="mt-4 text-xs text-ink-soft">
          Want to send something else? Reload this page.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">What is this about?</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t.value
                  ? "border-ink bg-ink text-cream"
                  : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="type"
                value={t.value}
                defaultChecked={t.value === "ITEM_REQUEST"}
                onChange={() => setType(t.value)}
                className="sr-only"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {type === "ITEM_REQUEST" && (
        <Field label="Item you want" hint="Brand and size help us find it." error={state.fieldErrors?.requestedItem}>
          <input
            name="requestedItem"
            maxLength={120}
            placeholder="e.g. Thums Up 330 ml can"
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Message" error={state.fieldErrors?.body}>
        <textarea
          name="body"
          rows={4}
          maxLength={1000}
          required
          placeholder="Tell us what you have in mind…"
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" hint="Optional">
          <input name="name" maxLength={80} autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Phone or email" hint="Only if you want a reply">
          <input name="contact" maxLength={120} autoComplete="email" className={inputClass} />
        </Field>
      </div>

      {state.status === "error" && state.message && (
        <p role="alert" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none placeholder:text-ink-soft/60 focus:border-ink/30";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-ink-soft">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-warn">{error}</span>}
    </label>
  );
}
