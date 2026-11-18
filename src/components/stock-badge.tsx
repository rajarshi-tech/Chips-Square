/**
 * Stock state, in the three buckets a customer actually cares about.
 *
 * With no reservations, `onHand` is the whole truth. Exact counts are shown when
 * settings.showExactStock is on — "3 left" is honest urgency, and hiding it only makes the shop
 * feel vague.
 */
export function StockBadge({ onHand }: { onHand: number }) {
  if (onHand <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-deep px-2.5 py-1 text-xs font-medium text-out">
        <span className="size-1.5 rounded-full bg-current" />
        Out of stock
      </span>
    );
  }
  if (onHand <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
        <span className="size-1.5 rounded-full bg-current" />
        Only {onHand} left
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
