import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { listCategories, listProducts } from "@/lib/queries/products";
import { getSettings } from "@/lib/settings";

type CatalogSearch = { q?: string; category?: string; sort?: string };

const SORTS = [
  { value: "discount", label: "Biggest discount" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
];

function hrefWith(current: CatalogSearch, patch: Partial<CatalogSearch>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category) params.set("category", next.category);
  if (next.sort && next.sort !== "discount") params.set("sort", next.sort);
  const qs = params.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export const metadata = {
  title: "The shelf",
  description: "Everything currently on the shelf, with MRP and our price side by side.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearch>;
}) {
  const current = await searchParams;
  const settings = await getSettings();
  const [items, categories] = await Promise.all([
    listProducts({
      q: current.q,
      category: current.category,
      sort: current.sort,
      inStockOnly: settings.hideOutOfStock,
    }),
    listCategories(),
  ]);

  const filtered = Boolean(current.q || current.category);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">The shelf</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {items.length} {items.length === 1 ? "item" : "items"}
            {filtered ? " matching your filter" : " in stock"}
          </p>
        </div>

        <form action="/catalog" className="flex w-full gap-2 sm:w-auto">
          {current.category && <input type="hidden" name="category" value={current.category} />}
          {current.sort && <input type="hidden" name="sort" value={current.sort} />}
          <input
            type="search"
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Search snacks, brands…"
            aria-label="Search products"
            className="h-10 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none placeholder:text-ink-soft/70 focus:border-ink/30 sm:w-64"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-xl bg-ink px-4 text-sm font-medium text-cream hover:bg-ink/90"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <FilterChip href={hrefWith(current, { category: undefined })} active={!current.category}>
          All
        </FilterChip>
        {categories.map((c) => (
          <FilterChip
            key={c.category}
            href={hrefWith(current, { category: c.category })}
            active={current.category === c.category}
          >
            {c.category}
            <span className="ml-1 text-xs opacity-60">{c.count}</span>
          </FilterChip>
        ))}

        <span className="ml-auto flex flex-wrap items-center gap-1 text-xs">
          <span className="text-ink-soft">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s.value}
              href={hrefWith(current, { sort: s.value })}
              className={`rounded-lg px-2 py-1 ${
                (current.sort ?? "discount") === s.value
                  ? "bg-ink text-cream"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium">Nothing matched.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            Try a shorter search, or{" "}
            <Link href="/feedback" className="underline underline-offset-2 hover:text-ink">
              ask us to stock it
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-cream"
          : "border-line bg-white text-ink-soft hover:border-ink/25 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
