import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "How it works",
  description: "How the buying club prices its stock and keeps the shelf count honest.",
};

export default async function HowItWorksPage() {
  const s = await getSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">How this works</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">
        {s.shopName} is not a shop with a warehouse. It is a few people who buy in bulk when the
        discounts are deep, and share the pack at a fair price. That is why the prices are low — and
        why the shelf, not a checkout, is the point of this site.
      </p>

      <div className="mt-10 space-y-8">
        <Section title="The price you see">
          <p>
            Every item has two numbers: the printed MRP, and our price. Our price is MRP minus a
            discount we set per item — nothing else is added. No delivery fee, no handling fee, no
            surge.
          </p>
          <p>
            The discount exists because we buy at quick-commerce sale prices, not at retail. When
            the next bulk order lands with a better cost, the discount usually goes up.
          </p>
        </Section>

        <Section title="The stock you see">
          <p>
            The count on each item is the number physically on the shelf. It drops the moment a sale
            is recorded and goes back up when a new bulk order arrives. There is no separate
            &ldquo;available online&rdquo; number, because there is no online booking — what you see is
            what is there.
          </p>
          <p>
            If an item shows <strong>Out of stock</strong>, we have run out and will pick it up on the
            next order. Ask for it through the request form and it moves up the list.
          </p>
        </Section>

        <Section title="Buying">
          <p>
            There is no cart and no account to create. Find what you want, come to the counter, and
            pay by cash or UPI. Your sale is recorded against the current batch, which is how the
            books stay straight and how the profit at the end of a batch is worked out.
          </p>
          <p>
            Prices include applicable taxes. We do not do delivery.
          </p>
        </Section>

        <Section title="Returns">
          <p>
            No returns on opened food items. If something is damaged or past its date, tell us before
            you leave the counter and we will replace it or refund it on the spot.
          </p>
        </Section>

        <Section title="Where the money goes">
          <p>
            This is a buying club, so the money is transparent by design. Partners put in the cost of
            each bulk order in equal shares. When the batch is sold, the profit — sales minus what
            the stock cost, minus things like transport — is split between them and paid out.
          </p>
          <p>
            That is why nothing here is priced to squeeze margin: the point is to make good buying
            pay for itself, not to run a shopfront.
          </p>
        </Section>
      </div>

      <div className="mt-12 rounded-2xl border border-line bg-white p-5">
        <p className="text-sm text-ink-soft">
          Something we should stock?{" "}
          <Link href="/feedback" className="font-medium text-ink underline underline-offset-2">
            Ask for it
          </Link>
          . Everything currently available is on the{" "}
          <Link href="/catalog" className="font-medium text-ink underline underline-offset-2">
            shelf
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
