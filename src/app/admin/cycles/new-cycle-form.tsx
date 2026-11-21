"use client";

import { useActionState } from "react";
import { createCycleAction, type CycleFormState } from "./actions";

const initialState: CycleFormState = { error: null };

export function NewCycleForm({ defaultOpenDate }: { defaultOpenDate: string }) {
  const [state, formAction, pending] = useActionState(createCycleAction, initialState);

  return (
    <form action={formAction} className="rounded-xl border border-black/10 p-4">
      <h2 className="text-sm font-semibold">Start a cycle</h2>
      <p className="mt-0.5 mb-3 text-xs text-neutral-500">
        A cycle is one batch of buying and selling. Sales land in whichever cycle is open, and the
        profit is split when you close it.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Name</span>
          <input name="name" required placeholder="August 2026" className={input} />
        </label>
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Opened on</span>
          <input type="date" name="openedAt" required defaultValue={defaultOpenDate} className={input} />
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Open cycle"}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10";
