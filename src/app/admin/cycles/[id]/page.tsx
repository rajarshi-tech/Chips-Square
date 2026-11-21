import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/money";
import { getSettlementForPreview, settlementPreview } from "@/lib/settle";
import { finaliseCycleAction, markSharePaidAction } from "../actions";

export const dynamic = "force-dynamic";

type ShareRow = {
  partnerId: string;
  partnerName: string;
  sharePct: string;
  amountPaise: number;
  id: string | null;
  paidAt: Date | null;
};

export default async function CyclePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; settled?: string }>;
}) {
  const { id } = await props.params;
  const { error, settled } = await props.searchParams;

  const [preview, user] = await Promise.all([settlementPreview(id), getSessionUser()]);
  if (!preview) notFound();

  const saved = await getSettlementForPreview(preview);
  const isOwner = user?.role === "OWNER";
  const { figures, counts, shares, cycle } = preview;
  // One shape for both states: a live preview has no share rows and no paid state yet.
  const sharing: ShareRow[] = saved
    ? saved.shares.map((share) => ({ ...share }))
    : shares.map((share) => ({ ...share, id: null, paidAt: null }));
  const loss = figures.profitPaise < 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/cycles" className="text-xs text-neutral-500 hover:underline">
          ← Cycles
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          {cycle.name}
          <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            {cycle.status.toLowerCase()}
          </span>
        </h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          opened {cycle.openedAt}
          {cycle.closedAt ? ` · closed ${cycle.closedAt}` : ""} · {counts.sales}{" "}
          {counts.sales === 1 ? "sale" : "sales"}, {counts.units} units, {counts.purchases}{" "}
          {counts.purchases === 1 ? "purchase" : "purchases"}, {counts.expenseLines}{" "}
          {counts.expenseLines === 1 ? "expense" : "expenses"}
        </p>
      </div>

      {settled ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Settled. Each share below is frozen to what was true today.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Revenue" value={formatINR(figures.revenuePaise)} />
        <Figure label="Cost of goods sold" value={formatINR(figures.cogsPaise)} />
        <Figure label="Expenses" value={formatINR(figures.expensesPaise)} />
        <Figure
          label={loss ? "Loss" : "Profit"}
          value={formatINR(figures.profitPaise)}
          accent={loss ? "text-red-700" : "text-emerald-700"}
        />
      </section>

      <p className="-mt-2 text-xs text-neutral-500">
        Revenue − cost of goods sold − expenses = profit. Only units that actually sold count as cost;
        stock still on the shelf stays in the next cycle
        {figures.closingStockValuePaise > 0
          ? ` (${formatINR(figures.closingStockValuePaise)} at cost right now)`
          : ""}
        .
      </p>

      {preview.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {preview.warnings.map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-black/10">
        <header className="flex items-center justify-between gap-2 border-b border-black/10 bg-black/[0.02] px-4 py-2.5">
          <h2 className="text-sm font-semibold">
            {saved ? "Split, as settled" : "Split preview"}
          </h2>
          <span className="text-xs text-neutral-500">
            {formatINR(saved ? figures.distributedPaise : preview.figures.distributedPaise)} across{" "}
            {sharing.length} {sharing.length === 1 ? "partner" : "partners"}
          </span>
        </header>

        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Partner</th>
              <th className="px-2 py-2 text-right font-medium">Share</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-right font-medium">Paid</th>
            </tr>
          </thead>
          <tbody>
            {sharing.map((share) => {
              return (
                <tr key={share.partnerId} className="border-t border-black/5">
                  <td className="px-4 py-2.5">{share.partnerName}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                    {share.sharePct}%
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                    {formatINR(share.amountPaise)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {share.paidAt ? (
                      <span className="text-xs text-emerald-700">
                        paid {new Date(share.paidAt).toISOString().slice(0, 10)}
                      </span>
                    ) : saved && isOwner && share.amountPaise > 0 ? (
                      <form action={markSharePaidAction}>
                        <input type="hidden" name="shareId" value={share.id ?? ""} />
                        <input type="hidden" name="cycleId" value={cycle.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-black/15 px-2.5 py-1 text-xs font-medium transition hover:bg-black/5"
                        >
                          Mark paid
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-neutral-400">not yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {saved ? (
        <p className="text-xs text-neutral-500">
          Settled on {saved.settlement.finalisedAt?.toISOString().slice(0, 10) ?? "—"}. These numbers
          never move again, even if a price changes later.
        </p>
      ) : isOwner ? (
        <form action={finaliseCycleAction} className="space-y-2">
          <input type="hidden" name="cycleId" value={cycle.id} />
          <button
            type="submit"
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700"
          >
            Close cycle and freeze the split
          </button>
          <p className="text-xs text-neutral-500">
            After this, the cycle stops taking sales and the amounts above are fixed. Sales after this
            go into the next cycle.
          </p>
        </form>
      ) : (
        <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-sm text-neutral-600">
          Only the owner can close a cycle. The preview above is live — it changes as sales come in.
        </p>
      )}

      <p className="text-xs text-neutral-500">
        Nothing here moves money. Pay each partner by UPI, then mark the row paid.
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 px-3 py-2.5">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${accent ?? ""}`}>{value}</p>
    </div>
  );
}
