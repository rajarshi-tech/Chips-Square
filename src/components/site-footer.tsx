import Link from "next/link";

/**
 * Footer. Also where the Open Food Facts attribution lives — required by its ODbL / CC-BY-SA
 * licence, and the promise we made in docs/03-product-data-sourcing.md.
 */
export function SiteFooter({
  storeName,
  supportPhone,
  supportEmail,
}: {
  storeName: string;
  supportPhone: string | null;
  supportEmail: string | null;
}) {
  return (
    <footer className="mt-16 border-t border-line bg-cream-deep/60">
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-ink-soft">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-sm space-y-2">
            <p className="font-semibold text-ink">{storeName}</p>
            <p className="leading-relaxed">
              A small buying club. We pool orders straight from quick-commerce discounts, so the
              pack you want costs less than it does in the app.
            </p>
          </div>

          <nav className="flex flex-col gap-2" aria-label="Footer">
            <Link href="/catalog" className="hover:text-ink">
              Shop all
            </Link>
            <Link href="/how-it-works" className="hover:text-ink">
              How it works
            </Link>
            <Link href="/feedback" className="hover:text-ink">
              Request an item
            </Link>
            {supportEmail && (
              <a href={`mailto:${supportEmail}`} className="hover:text-ink">
                {supportEmail}
              </a>
            )}
            {supportPhone && (
              <a href={`tel:${supportPhone}`} className="hover:text-ink">
                {supportPhone}
              </a>
            )}
          </nav>
        </div>

        <p className="mt-8 border-t border-line pt-6 text-xs leading-relaxed">
          Product names and pack sizes for some items come from{" "}
          <a
            href="https://world.openfoodfacts.org"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2 hover:text-ink"
          >
            Open Food Facts
          </a>{" "}
          (ODbL, images CC-BY-SA). Everything else is entered by us. Prices include applicable
          taxes.
        </p>
      </div>
    </footer>
  );
}
