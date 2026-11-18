import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscountChip, Price } from "@/components/price";
import { ProductCard } from "@/components/product-card";
import { ProductThumb } from "@/components/product-thumb";
import { StockBadge } from "@/components/stock-badge";
import { formatINR } from "@/lib/money";
import { getProductBySlug, relatedProducts } from "@/lib/queries/products";
import { getSettings } from "@/lib/settings";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Not found" };
  return {
    title: `${product.brand ? `${product.brand} ` : ""}${product.name}`,
    description:
      product.description ??
      `${product.name}${product.sizeLabel ? ` (${product.sizeLabel})` : ""} at ${formatINR(product.sellPaise)} — ${product.savingPct}% below MRP.`,
  };
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [related, settings] = await Promise.all([relatedProducts(product), getSettings()]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav className="mb-4 text-xs text-ink-soft" aria-label="Breadcrumb">
        <Link href="/catalog" className="hover:text-ink">
          Shelf
        </Link>
        {product.category && (
          <>
            <span className="mx-1.5">/</span>
            <Link href={`/catalog?category=${encodeURIComponent(product.category)}`} className="hover:text-ink">
              {product.category}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 sm:grid-cols-2">
        <ProductThumb
          product={product}
          className="aspect-square w-full rounded-2xl border border-line"
          sizes="(min-width: 640px) 480px, 92vw"
        />

        <div className="flex flex-col">
          {product.brand && (
            <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
            {product.name}
          </h1>
          {product.sizeLabel && <p className="mt-1 text-sm text-ink-soft">{product.sizeLabel}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Price mrpPaise={product.mrpPaise} sellPaise={product.sellPaise} size="lg" />
            <DiscountChip pct={product.savingPct} />
          </div>
          {product.savingPaise > 0 && (
            <p className="mt-1 text-sm text-ok">
              You save {formatINR(product.savingPaise)} against MRP
            </p>
          )}

          <div className="mt-5">
            <StockBadge onHand={product.onHand} />
            {settings.showExactStock && product.onHand > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                {product.onHand} on the shelf right now
              </p>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-medium">
              {product.onHand > 0 ? "Available to collect" : "Nothing on the shelf"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {product.onHand > 0
                ? `Ask for it at the counter${
                    settings.supportEmail ? `, or write to ${settings.supportEmail}` : ""
                  }. Stock counts here are live — they change the moment something is sold.`
                : "We restock in bulk a few times a month. Send us a request and we will pick it up on the next order."}
            </p>
          </div>

          {product.description && (
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">{product.description}</p>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">More on the shelf</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
