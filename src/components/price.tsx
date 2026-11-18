import { formatINR } from "@/lib/money";

/**
 * Price display. Every price in the app renders through this component so the
 * "MRP struck through + your price + saving" pattern is identical everywhere.
 */
export function Price({
  mrpPaise,
  sellPaise,
  size = "md",
}: {
  mrpPaise: number;
  sellPaise: number;
  size?: "sm" | "md" | "lg";
}) {
  const scale =
    size === "lg"
      ? { now: "text-3xl", was: "text-base", gap: "gap-2.5" }
      : size === "sm"
        ? { now: "text-base", was: "text-xs", gap: "gap-1.5" }
        : { now: "text-xl", was: "text-sm", gap: "gap-2" };

  const discounted = sellPaise < mrpPaise;

  return (
    <div className={`flex flex-wrap items-baseline ${scale.gap}`}>
      <span className={`tnum font-semibold tracking-tight ${scale.now}`}>
        {formatINR(sellPaise)}
      </span>
      {discounted && (
        <span className={`tnum text-ink-soft line-through ${scale.was}`}>
          {formatINR(mrpPaise)}
        </span>
      )}
    </div>
  );
}

/** "20% off" chip. Renders nothing when there is no discount, so layout never shifts. */
export function DiscountChip({ pct, className = "" }: { pct: number; className?: string }) {
  if (pct <= 0) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark ${className}`}
    >
      {pct}% off
    </span>
  );
}
