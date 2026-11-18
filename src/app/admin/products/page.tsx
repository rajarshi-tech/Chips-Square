import Link from "next/link";
import { formatINR } from "@/lib/money";
import { listAdminProducts } from "@/lib/catalog-admin";
import { toggleProductActiveAction } from "./actions";

export const dynamic = "force-dynamic";

type ListSearch = { q?: string; status?: string };

const TABS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out" },
  { value: "archived", label: "Archived" },
] as const;

function tabHref(current: ListSearch, status: string): string {
  const params = new URLSearchParams();
  if (current.q) params.set("q", current.q);
  if (status !== "all") params.set("status", status);
  const qs = params.toString();
  return qs ? `/admin/products?${qs}` : "/admin/products";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<ListSearch>;
}) {
  const current = await searchParams;
  const status = (TABS.some((t) => t.value === current.status) ? current.status : "all") as
    | "all"
    | "low"
    | "out"
    | "archived";

  const items = await listAdminProducts({
    q: current.q,
    status: status === "all" ? "active" : status,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {items.length} {items.length === 1 ? "product" : "products"} · prices are what the shop
            shows
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          Add product
        </Link>
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

      <nav aria-label="Filter products" className="flex flex-wrap gap-1">
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

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500">
          {status === "archived"
            ? "Nothing archived. Archive a product to hide it without losing its history."
            : "No products match. Add one from the shop floor."}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3"
            >
              <Link href={`/admin/products/${item.id}`} className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {item.name}
                    {item.sizeLabel ? (
                      <span className="font-normal text-neutral-500"> · {item.sizeLabel}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-neutral-500">
                    {[item.brand, item.category].filter(Boolean).join(" · ") ||
                      "no brand / category"}
                  </span>
                </span>
              </Link>

              <span className="w-20 shrink-0 text-right tabular-nums">
                <span className="block text-sm font-semibold">{formatINR(item.sellPaise)}</span>
                <span className="block text-xs text-neutral-400 line-through">
                  {formatINR(item.mrpPaise)}
                </span>
              </span>

              <span
                className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
                  item.onHand <= 0
                    ? "bg-red-50 text-red-700"
                    : item.lowStockThreshold !== null && item.onHand <= item.lowStockThreshold
                      ? "bg-amber-50 text-amber-700"
                      : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {item.onHand} on hand
              </span>

              <form action={toggleProductActiveAction} className="shrink-0">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="nextActive" value={String(!item.isActive)} />
                <button
                  type="submit"
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    item.isActive
                      ? "text-neutral-500 hover:bg-red-50 hover:text-red-700"
                      : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {item.isActive ? "Archive" : "Restore"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}