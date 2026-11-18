import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { catalogStats, listProducts } from "@/lib/queries/products";
import { getSettings } from "@/lib/settings";

export default async function HomePage() {
  const [featured, stats, settings] = await Promise.all([
    listProducts({ limit: 8, sort: "discount" }),
    catalogStats(),
    getSettings(),
  ]);

  return (
    <>
      <section className="border-b border-line bg-gradient-to-b from-cream to-cream-deep/50">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink-soft ring-1 ring-line">
            <span className="size-1.5 rounded-full bg-ok" />
            {stats.products} items in stock right now
          </p>

          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            The same pack.
            <br />
            <span className="text-brand">Without the app markup.</span>
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft">
            We buy in bulk when the quick-commerce discounts are deep, and pass the pack on at MRP
            minus up to {stats.maxDiscount}%. No delivery fee, no minimum order — you reserve it,
            you collect it.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/catalog"
              className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-sm font-medium text-cream transition-colors hover:bg-ink/90"
            >
              Browse the shelf
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-5 text-sm font-medium transition-colors hover:bg-cream-deep"
            >
              How this works
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Biggest discounts on the shelf</h2>
          <Link href="/catalog" className="text-sm text-ink-soft hover:text-ink">
            See all →
          </Link>
        </div>

        {featured.length === 0 ? (
          <EmptyShelf />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-3">
          <Step
            n="1"
            title="Reserve what you want"
            body="Pick the pack. It is held for you for a few minutes while you pay by UPI."
          />
          <Step
            n="2"
            title="Pay by UPI, we verify"
            body="Scan the code, send the exact amount. We confirm it against our statement — no screenshots needed."
          />
          <Step
            n="3"
            title="Collect it"
            body={`Show your pickup code at the counter. Unclaimed reservations are refunded as store credit after ${settings.unclaimedCancelDays} days.`}
          />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="rounded-2xl border border-line bg-cream-deep/70 p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight">Want something we don&apos;t stock?</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            Tell us the item. Requests are counted, and the most-wanted ones go into the next bulk
            order.
          </p>
          <Link
            href="/feedback"
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
          >
            Request an item
          </Link>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-dark">
        {n}
      </span>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

export function EmptyShelf() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="text-sm font-medium">Nothing on the shelf yet.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
        Run <code className="rounded bg-cream-deep px-1.5 py-0.5 text-xs">npm run db:seed</code> to
        load demo products, or add your first product as an admin.
      </p>
    </div>
  );
}
