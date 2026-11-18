import Image from "next/image";
import type { ProductCardDto } from "@/lib/queries/products";

/**
 * Product imagery, with a deterministic fallback.
 *
 * Real products get a photo uploaded by an admin (imagePath). Anything still without one shows a
 * generated tile derived from the name — better than a grey box, and it never breaks the grid.
 */

const PALETTE = ["#f9d9b8", "#f7e2b0", "#dcecd7", "#e6dcf5", "#fbd5d5", "#d7e9f4"];

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100000;
  return h;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProductThumb({
  product,
  className = "",
  sizes = "(min-width: 640px) 240px, 45vw",
}: {
  product: Pick<ProductCardDto, "name" | "brand" | "imagePath" | "sizeLabel">;
  className?: string;
  sizes?: string;
}) {
  if (product.imagePath) {
    return (
      <div className={`relative overflow-hidden bg-white ${className}`}>
        <Image
          src={product.imagePath}
          alt={product.brand ? `${product.brand} ${product.name}` : product.name}
          fill
          sizes={sizes}
          className="object-contain p-2"
        />
      </div>
    );
  }

  const bg = PALETTE[hashHue(product.name) % PALETTE.length];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    >
      <span className="text-2xl font-bold tracking-tight text-ink/40 select-none">
        {initials(product.brand ?? product.name)}
      </span>
      {product.sizeLabel && (
        <span className="absolute bottom-1.5 right-2 text-[10px] font-medium text-ink/35">
          {product.sizeLabel}
        </span>
      )}
    </div>
  );
}
