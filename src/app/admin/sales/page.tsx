import Link from "next/link";
import { formatINR } from "@/lib/money";
import { listSales, salesSummary } from "@/lib/sales";
import { voidSaleAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ recorded?: string; voided?: string }>;
}) {
  const flags = await searchParams;
  const [summary, rows] = await Promise.all([salesSummary(), listSales({ limit: 40 })]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sales</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Today: {formatINR(summary.totalPaise)} · {summary.count}{" "}
            {summary.count === 1 ? "sale" : "sales"} · {summary.units} units
          </p>
        </div>
        <Link
          href="/admin/sales/new"
          className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
        >
          Record sale
        </Link>
      </div>

      {flags.recorded ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Sale {flags.recorded} recorded. Stock has already come off the shelf.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500">
          Nothing sold yet. Record the first one and this becomes the day book.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((sale) => (
            <li
              key={sale.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {sale.code}
                  {sale.buyerName ? (
                    <span className="font-normal text-neutral-500"> · {sale.buyerName}</span>
                  ) : null}
                  {sale.voided ? (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      voided
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-neutral-500">
                  {sale.soldAt.toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {sale.method.toLowerCase()} · {sale.unitCount} units · {sale.itemCount}{" "}
                  {sale.itemCount === 1 ? "line" : "lines"}
                </span>
              </span>

              <span
                className={`w-24 shrink-0 text-right tabular-nums ${
                  sale.voided ? "text-neutral-400 line-through" : "font-semibold"
                }`}
              >
                {formatINR(sale.totalPaise)}
              </span>

              {sale.voided ? null : (
                <details className="shrink-0">
                  <summary className="cursor-pointer rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5">
                    Void
                  </summary>
                  <form action={voidSaleAction} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="saleId" value={sale.id} />
                    <input
                      name="reason"
                      required
                      placeholder="Why? (required)"
                      aria-label={`Reason for voiding ${sale.code}`}
                      className="w-56 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                    >
                      Void and put stock back
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-neutral-500">
        A sale is never deleted. Voiding it returns the units to the shelf, records why, and drops it
        from the cycle&apos;s revenue.
      </p>
    </div>
  );
}