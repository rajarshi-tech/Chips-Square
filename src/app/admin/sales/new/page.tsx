import Link from "next/link";
import { SaleForm } from "../sale-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New sale" };

export default function NewSalePage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/sales" className="text-xs text-neutral-500 hover:text-black">
          ← Sales
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Record a sale</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          What left the counter. This is revenue for the cycle, so it is worth getting right.
        </p>
      </div>

      <SaleForm />
    </div>
  );
}