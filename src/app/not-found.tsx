import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        This page does not exist, or the item was removed from the shelf.
      </p>
      <Link
        href="/catalog"
        className="mt-6 inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm font-medium text-cream hover:bg-ink/90"
      >
        Back to the shelf
      </Link>
    </div>
  );
}
