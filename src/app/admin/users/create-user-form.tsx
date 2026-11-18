"use client";

import { useActionState } from "react";
import { createUserAction, type UserFormState } from "./actions";

const initialState: UserFormState = { error: null };

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  return (
    <div className="rounded-xl border border-black/10 p-4">
      <h2 className="text-sm font-semibold">Add someone</h2>
      <p className="mt-0.5 mb-3 text-xs text-neutral-500">
        They cannot sign up themselves. Leave the password blank and one is generated — it is shown
        once, so copy it before you leave this page.
      </p>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="priya@example.com"
            className={input}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Name</span>
          <input name="name" placeholder="Priya" className={input} />
        </label>

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Role</span>
          <select name="role" defaultValue="ADMIN" className={input}>
            <option value="ADMIN">Admin — everything except managing people</option>
            <option value="OWNER">Owner — also manages people and settlements</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="block text-xs font-medium">Password (optional)</span>
          <input name="password" placeholder="Leave blank to generate" className={input} />
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>

      {state.error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}

      {state.created ? (
        <div role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <p className="font-medium">Account created for {state.created.email}</p>
          <p className="mt-1">
            Password:{" "}
            <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[13px] select-all">
              {state.created.password}
            </code>
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Shown once, only the hash is stored. Send it to them yourself.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const input =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10";
