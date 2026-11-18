import type { Metadata } from "next";
import Link from "next/link";
import { requireManager } from "@/lib/auth/session";
import { logout } from "@/app/logout/actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Chips Square" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview", ready: true },
  { href: "/admin/products", label: "Products", ready: true },
  { href: "/admin/stock", label: "Stock", ready: true },
  { href: "/admin/sales", label: "Sales", ready: true },
  { href: "/admin/purchases", label: "Purchases", ready: false },
  { href: "/admin/cycles", label: "Cycles", ready: false },
  { href: "/admin/partners", label: "Partners", ready: false },
  { href: "/admin/feedback", label: "Feedback", ready: false },
  { href: "/admin/users", label: "People", ready: true, ownerOnly: true },
] as const;


/**
 * The guard sits here, not only in individual pages: every admin route inherits it. Individual
 * server actions still call `requireManager()` themselves — a layout does not protect an action.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManager();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Admin</h1>
          <span className="text-xs text-neutral-500">
            {user.name ?? user.email} · {user.role.toLowerCase()}
          </span>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="rounded-full border border-black/15 px-3.5 py-1.5 text-xs font-medium transition hover:bg-black/5"
          >
            Sign out
          </button>
        </form>
      </div>

      <nav aria-label="Admin sections" className="-mx-1 mb-8 overflow-x-auto">
        <ul className="flex gap-1 px-1">
          {NAV.filter((item) => !("ownerOnly" in item) || user.role === "OWNER").map((item) => (
            <li key={item.href}>
              {item.ready ? (
                <Link
                  href={item.href}
                  className="inline-block rounded-full px-3.5 py-1.5 text-sm text-neutral-700 transition hover:bg-black/5"
                >
                  {item.label}
                </Link>
              ) : (
                // Shown but not linked: a dead link teaches nothing. The label stays so the shape
                // of the back office is visible while it is being built.
                <span
                  aria-disabled="true"
                  className="inline-block cursor-default rounded-full px-3.5 py-1.5 text-sm text-neutral-400"
                >
                  {item.label}
                  <span className="ml-1.5 text-[10px] tracking-wide uppercase">soon</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {children}
    </div>
  );
}
