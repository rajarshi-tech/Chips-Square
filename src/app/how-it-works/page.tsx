import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata = {
  title: "How it works",
  description: "How the buying club prices, holds and hands over stock.",
};

export default async function HowItWorksPage() {
  const s = await getSettings();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">How this works</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-soft">
        Chips Square is not a shop with a warehouse. It is a handful of people who buy in bulk when
        the discounts are deep, and share the pack at a fair price. That is why the prices are low
        and why everything is reservation-based.
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

        <Section title={`Reserving (holds ${s.holdTtlMinutes} minutes)`}>
          <p>
            Reserving takes an item off the shelf for you for {s.holdTtlMinutes} minutes. That is the
            window to pay — long enough to open UPI, short enough that nobody can sit on stock they
            do not intend to buy.
          </p>
          <p>
            When the window closes without a payment, the item goes back on the shelf automatically.
            Your reservation disappears; you are not charged anything.
          </p>
        </Section>

        <Section title="Paying">
          <p>
            Payment is UPI: you send the exact amount shown, and we verify it against our bank
            statement using the reference number (UTR) from your app. A screenshot alone is not
            accepted, because screenshots can be edited and references cannot.
          </p>
          <p>
            The item is yours once the payment is verified. You get a pickup code at that point.
          </p>
        </Section>

        <Section title="Collecting">
          <p>
            Show the pickup code at the counter and take the item. If you cannot collect within{" "}
            {s.unclaimedCancelDays} days, the reservation is cancelled and refunded as store credit
            so the stock is not stuck behind an unclaimed order.
          </p>
        </Section>

        <Section title="Fair use">
          <p>
            You can hold at most {s.maxActiveHoldsPerUser} reservations at a time.
            {" "}{s.noShowLimit} expired reservations and new reservations need payment up front for{" "}
            {s.cooldownDays} days. This is not aimed at anyone in particular — it keeps the shelf
            honest for everyone.
          </p>
          <p>
            If an item is down to its last few units, it moves to a queue instead of an open hold, so
            one person cannot block the rest.
          </p>
        </Section>

        <Section title="What we do not do">
          <p>
            No delivery. No returns on opened food items. No holding stock without payment. If
            something arrives damaged, tell us before you leave the counter and we will replace or
            refund it.
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
