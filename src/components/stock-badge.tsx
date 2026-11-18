/**
 * Stock state, in the three buckets a customer actually cares about.
 *
 * We show the exact count too (see settings.showExactStock) because "3 left" creates honest
 * urgency — and because hiding it does not stop anyone, it just makes the shop feel vague.
 */
export function StockBadge({ available, onHand }: { available: number; onHand: number }) {
  if (available <= 0 && onHand > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
        <span className="size-1.5 rounded-full bg-current" />
        All reserved
      </span>
    );
  }
  if (available <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-deep px-2.5 py-1 text-xs font-medium text-out">
        <span className="size-1.5 rounded-full bg-current" />
        Out of stock
      </span>
    );
  }
  if (available <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
        <span className="size-1.5 rounded-full bg-current" />
        Only {available} left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-medium text-ok">
      <span className="size-1.5 rounded-full bg-current" />
      In stock
    </span>
  );
}
