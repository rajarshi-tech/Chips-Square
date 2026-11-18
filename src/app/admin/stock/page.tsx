import Link from "next/link";
import { formatINR } from "@/lib/money";
import { listStockRows, recentMovements } from "@/lib/stock-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

type ListSearch = { q?: string; status?: string };

const TABS = [
  { value: "all", label: "All" },
  { value: "low", label: "Running low" },
  { value: "out", label: "Out of stock" },
  { value: "archived", label: "Archived" },
] as const;

function tabHref(current: ListSearch, status: string): string {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();
  return qs ? `/admin/stock?${qs}` : "/admin/stock";
}

export default async function StockPage({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const current = await searchParams;
  const status = (TABS.some((t) => t.value === current.status) ? current.status : "all") as
    | "all"
    | "low"
    | "out"
    | "archived";

  const [rows, movements] = await Promise.all([
    listStockRows({ q: current.q, status: status === "all" ? "active" : status }),
    recentMovements(12),
  ]);

  const units = rows.reduce((sum, r) => sum + r.onHand, 0);
  const value = rows.reduce((sum, r) => sum + r.valuePaise, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Stock</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          {units} units · {formatINR(value)} at cost · pick a product to record what moved
        </p>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="Search name, brand or barcode…"
          className="w-full max-w-sm rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-black/15 px-3.5 py-2 text-sm font-medium transition hover:bg-black/5"
        >
          Search
        </button>
      </form>

      <nav aria-label="Filter stock" className="flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <Link
              key={tab.value}
              href={tabHref(current, tab.value)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                active
                  ? "bg-neutral-900 text-white"
                  : "border border-black/10 text-neutral-700 hover:bg-black/5"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500">
          Nothing here. Add products first, then record what arrives.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3"
            >
              <Link href={`/admin/stock/${row.id}`} className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {row.name}
                    {row.sizeLabel ? (
                      <span className="font-normal text-neutral-500"> · {row.sizeLabel}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-neutral-500">
                    {row.brand ?? "no brand"}
                    {row.avgCostPaise > 0
                      ? ` · cost ${formatINR(row.avgCostPaise)}/unit · ${formatINR(row.valuePaise)} on the shelf`
                      : " · no cost recorded yet"}
                  </span>
                </span>
              </Link>

              <span
                className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
                  row.onHand <= 0
                    ? "bg-red-50 text-red-700"
                    : row.lowStockThreshold !== null && row.onHand <= row.lowStockThreshold
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {row.onHand} on hand
              </span>

              <Link
                href={`/admin/stock/${row.id}`}
                className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5"
              >
                Adjust
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="rounded-xl border border-black/10 p-4">
        <h2 className="text-sm font-semibold">Last movements</h2>
        {movements.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing has moved yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-black/5 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <Link href={`/admin/stock/${m.productId}`} className="truncate hover:underline">
                    {m.productName}
                  </Link>
                  <span className="block truncate text-xs text-neutral-500">
                    {m.type.toLowerCase()}
                    {m.note ? ` · ${m.note}` : ""}
                    {m.actor ? ` · ${m.actor}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 tabular-nums font-medium ${
                    m.qtyDelta > 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {m.qtyDelta > 0 ? "+" : ""}
                  {m.qtyDelta}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Every row here is a permanent ledger entry. Corrections are new movements, never edits.
        </p>
      </section>
    </div>
  );
}
