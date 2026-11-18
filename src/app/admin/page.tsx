import { adminOverview, salesToday } from "@/lib/queries/dashboard";
import { formatINR } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [overview, today] = await Promise.all([adminOverview(), salesToday()]);

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="On the shelf" value={`${overview.unitsOnHand}`} hint="units, all products" />
        <Tile label="Stock at cost" value={overview.stockValueLabel} hint="what you paid for it" />
        <Tile
          label="Sold today"
          value={formatINR(today.totalPaise)}
          hint={`${today.count} ${today.count === 1 ? "sale" : "sales"}`}
        />
        <Tile
          label={overview.openCycle ? overview.openCycle.name : "Open cycle"}
          value={overview.openCycle ? formatINR(overview.openCycle.revenuePaise) : "—"}
          hint={
            overview.openCycle
              ? `${overview.openCycle.unitsSold} units · ${overview.openCycle.saleCount} sales`
              : "no cycle open"
          }
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent sales">
          {overview.recentSales.length === 0 ? (
            <Empty>
              Nothing sold yet. Record a sale and the numbers here — and the public stock count —
              update together.
            </Empty>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {overview.recentSales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {sale.code}
                      {sale.buyerName ? (
                        <span className="font-normal text-neutral-500"> · {sale.buyerName}</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {sale.soldAt.toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {sale.method.toLowerCase()}
                      {sale.voided ? " · voided" : ""}
                    </span>
                  </span>
                  <span
                    className={
                      sale.voided
                        ? "shrink-0 tabular-nums text-neutral-400 line-through"
                        : "shrink-0 tabular-nums font-medium"
                    }
                  >
                    {sale.totalLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Running low">
          {overview.lowStock.length === 0 ? (
            <Empty>
              Nothing below its threshold. Set a threshold on a product to be warned before it runs
              out.
            </Empty>
          ) : (
            <ul className="divide-y divide-black/5 text-sm">
              {overview.lowStock.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-600">
                    {row.onHand} left
                    {row.threshold ? ` · warn at ${row.threshold}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <p className="text-xs text-neutral-500">
        Every number on this page is derived from <code className="rounded bg-black/5 px-1">stock_movements</code>{" "}
        and <code className="rounded bg-black/5 px-1">sales</code>. {overview.productCount} active
        products tracked.
      </p>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-black/10 p-4">
      <div className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

/**
 * No "view all" link until those pages exist — a dashboard link into a 404 is worse than no link.
 */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/10 p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-neutral-500">{children}</p>;
}
