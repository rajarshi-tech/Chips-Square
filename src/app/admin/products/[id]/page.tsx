import Link from "next/link";
import { notFound } from "next/navigation";
import { formatINR, toNumber } from "@/lib/money";
import { getAdminProduct, listCategories } from "@/lib/catalog-admin";
import { toggleProductActiveAction, updateProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;
  const [product, categories] = await Promise.all([getAdminProduct(id), listCategories()]);
  if (!product) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/products" className="text-xs text-neutral-500 hover:text-black">
          ← Products
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          {product.isActive ? null : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              archived
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-neutral-500">
          {product.onHand} on hand · {formatINR(product.sellPaise)} ·{" "}
          {toNumber(product.discountPct)}% off {formatINR(product.mrpPaise)} MRP
          {product.onHand > 0 ? (
            <>
              {" · "}
              <Link href={`/product/${product.slug}`} className="underline hover:text-black">
                view in shop
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {flags.created ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Product created. Add stock with a purchase or an adjustment when it arrives.
        </p>
      ) : null}
      {flags.saved ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved. The shop shows the new price on its next load.
        </p>
      ) : null}

      <ProductForm
        action={updateProductAction}
        categories={categories}
        submitLabel="Save changes"
        initial={{
          id: product.id,
          name: product.name,
          brand: product.brand ?? "",
          category: product.category ?? "",
          sizeLabel: product.sizeLabel ?? "",
          barcode: product.barcode ?? "",
          mrpRupees: (product.mrpPaise / 100).toFixed(2),
          discountPct: String(toNumber(product.discountPct)),
          lowStockThreshold: product.lowStockThreshold?.toString() ?? "",
          description: product.description ?? "",
        }}
      />

      <div className="mt-8 max-w-2xl rounded-xl border border-black/10 p-4">
        <h2 className="text-sm font-semibold">
          {product.isActive ? "Archive this product" : "Restore this product"}
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          {product.isActive
            ? "Hides it from the shop. Past sales and stock movements keep pointing at it, so the records stay honest."
            : "Puts it back on the shelf with whatever stock it still has."}
        </p>
        <form action={toggleProductActiveAction} className="mt-3">
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="nextActive" value={String(!product.isActive)} />
          <button
            type="submit"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              product.isActive
                ? "border border-red-200 text-red-700 hover:bg-red-50"
                : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            {product.isActive ? "Archive" : "Restore"}
          </button>
        </form>
      </div>

      <p className="max-w-2xl text-xs text-neutral-500">
        Renaming does not change the URL (<code className="rounded bg-black/5 px-1">{product.slug}</code>),
        so links you have shared keep working. Editing needs a barcode to be re-entered only if you
        want to change it.
      </p>
    </div>
  );
}
