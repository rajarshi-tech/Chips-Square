import { FeedbackForm } from "./feedback-form";

export const metadata = {
  title: "Request an item",
  description: "Ask us to stock something, or tell us how the shop could be better.",
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Request an item</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        We order in bulk a few times a month. Tell us what is missing from the shelf — the items
        people ask for most are what we buy next.
      </p>

      <div className="mt-8">
        <FeedbackForm />
      </div>
    </div>
  );
}
