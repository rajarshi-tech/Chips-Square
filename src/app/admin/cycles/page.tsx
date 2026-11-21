import Link from "next/link";
import { formatINR } from "@/lib/money";
import { listCycles } from "@/lib/settle";
import { NewCycleForm } from "./new-cycle-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cycles" };

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-amber-50 text-amber-700",
  SETTLED: "bg-neutral-100 text-neutral-600",
};

export default async function CyclesPage() {
  const cycles = await listCycles();
  const hasOpen = cycles.some((c) => c.status === "OPEN");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Cycles</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          One batch of buying and selling. Closing a cycle freezes the split.
        </p>
      </div>

      {hasOpen ? (
        <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-neutral-600">
          A cycle is already open. Close and settle it before starting the next one.
        </p>
      ) : (
        <NewCycleForm defaultOpenDate={today} />
      )}

      {cycles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500">
          No cycles yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {cycles.map((cycle) => (
            <li
              key={cycle.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3"
            >
              <Link href={`/admin/cycles/${cycle.id}`} className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{cycle.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLE[cycle.status] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {cycle.status.toLowerCase()}
                  </span>
                </span>
                <span className="block text-xs text-neutral-500">
                  opened {cycle.openedAt}
                  {cycle.closedAt ? ` · closed ${cycle.closedAt}` : ""} · {cycle.saleCount}{" "}
                  {cycle.saleCount === 1 ? "sale" : "sales"}
                </span>
              </Link>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                {formatINR(cycle.revenuePaise)}
              </span>
              <Link
                href={`/admin/cycles/${cycle.id}`}
                className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5"
              >
                {cycle.settlementId ? "View split" : "Preview split"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
