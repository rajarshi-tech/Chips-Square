import Link from "next/link";
import { listSellableProducts } from "@/lib/queries/sellable";
import { SaleForm } from "../sale-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New sale" };

export default async function NewSalePage() {
  const products = await listSellableProducts();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/sales" className="text-xs text-neutral-500 hover:text-black">
          ← Sales
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Record a sale</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Tap a pack as it leaves the counter. {products.length}{" "}
          {products.length === 1 ? "product is" : "products are"} on the shelf right now.
        </p>
      </div>

      <SaleForm products={products} />
    </div>
  );
}
