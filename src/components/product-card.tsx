import Link from "next/link";
import { DiscountChip, Price } from "@/components/price";
import { ProductThumb } from "@/components/product-thumb";
import { StockBadge } from "@/components/stock-badge";
import type { ProductCardDto } from "@/lib/queries/products";

/**
 * The grid tile. One tap target (the whole card is the link), no nested links, no hover-only
 * affordances — this is designed for a thumb on a 4G phone first.
 */
export function ProductCard({ product }: { product: ProductCardDto }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-white transition-shadow hover:shadow-[0_2px_16px_rgba(27,22,19,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <div className="relative">
        <ProductThumb product={product} className="aspect-square w-full" />
        <DiscountChip pct={product.savingPct} className="absolute left-2 top-2 shadow-sm" />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
            {product.brand}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
        <Price mrpPaise={product.mrpPaise} sellPaise={product.sellPaise} size="sm" />
        <div className="mt-auto pt-1.5">
          <StockBadge onHand={product.onHand} />
        </div>
      </div>
    </Link>
  );
}
