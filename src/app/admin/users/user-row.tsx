"use client";

import { useActionState } from "react";
import {
  deleteUserAction,
  resetPasswordAction,
  revokeAccessAction,
  setRoleAction,
  type DeleteState,
  type PasswordState,
} from "./actions";
import type { AdminUserRow } from "@/lib/users-admin";

const initialState: PasswordState = { error: null };
const initialDeleteState: DeleteState = { error: null };

const ROLE_NOTE: Record<string, string> = {
  OWNER: "everything, including people and settlements",
  ADMIN: "products, stock, sales, purchases — not people",
};

export function UserRow({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteUserAction, initialDeleteState);

  return (
    <li className="rounded-xl border border-black/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {user.name ?? user.email}
            {isSelf ? <span className="ml-1.5 text-xs text-neutral-400">you</span> : null}
          </p>
          <p className="truncate text-xs text-neutral-500">{user.email}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {user.canSignIn ? (
              <>
                {user.lastLoginAt
                  ? `Last signed in ${user.lastLoginAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}`
                  : "Never signed in"}
              </>
            ) : (
              <span className="text-amber-700">No password — cannot sign in</span>
            )}
            {" · "}
            {user.partnerId && user.partnerActive ? (
              <span className="text-emerald-700">in the profit split</span>
            ) : user.partnerId ? (
              <span className="text-neutral-500">left the split</span>
            ) : (
              <span className="text-amber-700">not in the profit split yet</span>
            )}
          </p>
        </div>

        <form action={setRoleAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            aria-label={`Role for ${user.email}`}
            className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-xs"
          >
            {(["ADMIN", "OWNER"] as const).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5"
          >
            Save
          </button>
        </form>
      </div>

      <p className="mt-1 text-[11px] text-neutral-400">{ROLE_NOTE[user.role]}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/5 pt-3">
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={user.id} />
          <input
            name="password"
            type="text"
            placeholder="New password"
            aria-label={`New password for ${user.email}`}
            className="w-40 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-medium transition hover:bg-black/5 disabled:opacity-60"
          >
            {pending ? "Setting…" : "Set password"}
          </button>
        </form>

        {isSelf ? null : (
          <>
            <form action={revokeAccessAction}>
              <input type="hidden" name="id" value={user.id} />
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
              >
                Revoke access
              </button>
            </form>

            <details className="ml-auto">
              <summary className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                Remove account
              </summary>
              <form action={deleteAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={user.id} />
                <input
                  name="confirmEmail"
                  required
                  placeholder={`Type ${user.email} to confirm`}
                  aria-label={`Type ${user.email} to confirm deletion`}
                  className="w-56 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Removing…" : "Delete permanently"}
                </button>
              </form>
            </details>
          </>
        )}
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          {state.error}
        </p>
      ) : null}
      {deleteState.error ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          {deleteState.error}
        </p>
      ) : null}
      {state.reset ? (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
          Password for {state.reset.email} is now{" "}
          <code className="rounded bg-white px-1 font-mono select-all">{state.reset.password}</code>{" "}
          — shown once.
        </p>
      ) : null}
    </li>
  );
}
