import Link from "next/link";
import { notFound } from "next/navigation";
import { formatINR } from "@/lib/money";
import { getStockDetail } from "@/lib/stock-admin";
import { AdjustForm } from "../adjust-form";
import { recalcStockAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getStockDetail(id);
  if (!detail) notFound();

  const { product, movements } = detail;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/stock" className="text-xs text-neutral-500 hover:text-black">
          ← Stock
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          {product.sizeLabel ? (
            <span className="text-sm text-neutral-500">{product.sizeLabel}</span>
          ) : null}
          {product.isActive ? null : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              archived
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-neutral-500">
          {product.onHand} on the shelf
          {product.avgCostPaise > 0 ? (
            <>
              {" · "}
              {formatINR(product.avgCostPaise)} average cost · {formatINR(product.valuePaise)} tied up
            </>
          ) : (
            " · no cost recorded yet"
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <AdjustForm productId={product.id} onHand={product.onHand} />

        <section className="rounded-xl border border-black/10 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">History</h2>
            <form action={recalcStockAction}>
              <input type="hidden" name="productId" value={product.id} />
              <button
                type="submit"
                className="rounded-full border border-black/15 px-2.5 py-1 text-[11px] font-medium text-neutral-600 transition hover:bg-black/5"
              >
                Rebuild count from ledger
              </button>
            </form>
          </div>

          {movements.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No movements yet. Record what arrives and this becomes the product&apos;s story.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-black/5 text-sm">
              {movements.map((m) => (
                <li key={m.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                      {m.type.toLowerCase()}
                    </span>
                    <span
                      className={`tabular-nums font-medium ${
                        m.qtyDelta > 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {m.qtyDelta > 0 ? "+" : ""}
                      {m.qtyDelta}
                      {m.unitCostPaise !== null ? (
                        <span className="ml-1.5 text-xs font-normal text-neutral-500">
                          @ {formatINR(m.unitCostPaise)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {m.note ? <p className="text-xs text-neutral-600">{m.note}</p> : null}
                  <p className="text-[11px] text-neutral-400">
                    {m.createdAt.toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {m.actor ? ` · ${m.actor}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
