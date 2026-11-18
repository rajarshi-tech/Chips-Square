import Link from "next/link";
import { listCategories } from "@/lib/catalog-admin";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const categories = await listCategories();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/products" className="text-xs text-neutral-500 hover:text-black">
          ← Products
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">New product</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          Add what is on the shelf. Stock still arrives through a purchase or an adjustment.
        </p>
      </div>

      <ProductForm
        action={createProductAction}
        categories={categories}
        submitLabel="Create product"
      />
    </div>
  );
}
