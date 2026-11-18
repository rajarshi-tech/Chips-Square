# 00 — The decisions, with the reasoning

Five choices that are expensive to reverse later. Each one: the options, what's wrong with them,
and what to do.

---

## D1. Getting product name + image from Blinkit / Flipkart Minutes

**Short answer: no, you cannot do it reliably or legally, and you don't need to.**

Facts as of today:

- Blinkit and Flipkart Minutes publish **no public product API**. Their seller/brand panels only
  cover your own listings.
- Their catalogues are **hyperlocal**: the same product has different prices, MRP and stock per
  dark store, resolved by pincode or lat/long. There is no single "the catalog" to import.
- They actively block datacenter IPs and bot traffic. Scraped data breaks on every layout change.
- Third-party "APIs" exist (Upscrape, DataBlue, QuickCommerceAPI, Shelf). Velid but priced for
  market-research teams: Shelf is ~₹29,999/month, others are per-credit. For a 5-person club with
  a few hundred SKUs this is **orders of magnitude more expensive than typing the data in once**.

So: **manual entry, made fast.** The number that matters is cost per SKU. Typing a product takes
~25 seconds. 200 SKUs ≈ 90 minutes, once, and then only a few per week.

Recommended admin add-product flow (`docs/03` has the detail):

1. **Scan the barcode** with the phone camera (`BarcodeDetector` API or `html5-qrcode`).
2. Look it up in **Open Food Facts** (free, no key, ODbL licence → requires attribution, images are
   CC-BY-SA). Returns `product_name`, `brands`, `quantity`, `image_front_url` for most Indian FMCG.
3. Pre-fill the form; admin confirms/edits — **never auto-save from an external source**.
4. **Upload your own photo** (`<input type="file" accept="image/*" capture="environment">` — one tap,
   camera opens). Store it in your own bucket. Do not hotlink store CDNs: they block hotlinking and
   rotate URLs.
5. Bulk **CSV import** for the first batch — fill a spreadsheet once, import, done.

Worst case (loose items, local brands, no barcode) it's a name, a price and a photo. Fine.

> Optional nice-to-have later: admin pastes a store product URL, server fetches the page and reads
> `og:title` / `og:image` to pre-fill. Best-effort only, admin always confirms, never bulk, never
> relied upon.

## D2. Stopping reservation abuse

Full analysis in `docs/02-reservations-and-payments.md`. The headline:

> **The exploit exists because you let people reserve for free.**
> Change the order to *hold → pay → confirm*, with a hard expiry, and most of it disappears.

Three rules carry 90% of the weight:

1. **A reservation is a hold with a TTL (10–15 min), not a booking.** No payment in the window →
   stock is released automatically and the user gets a no-show strike.
2. **Proof of payment is a UTR (12-digit UPI reference) that must be unique in the database,**
   matched against your bank/UPI statement. Screenshots are evidence, never authority. A unique
   constraint means one payment can never settle two orders.
3. **Reputation.** `no_show_count` on the account. 2 strikes → prepay-only or a 7-day cooldown.
   Scarcity + rules + a visible score is enough for a closed 5-partner club.

Phase 5 upgrades this to a **gateway webhook** (Razorpay/Cashfree): payment is confirmed by a signed
server callback, no human checks anything, refunds become one click. Cost: ~2% platform fee on UPI
(0% MDR does not apply to the platform fee). On ₹50k/month that is ₹1,000 — cheaper than an hour of
reconciliation per week.

## D3. Where inventory truth lives

Options: a mutable `stock_qty` column · a stock ledger.

| | mutable column | ledger |
|---|---|---|
| simple | ✅ | ❌ |
| explains a wrong number | ❌ | ✅ |
| survives concurrent edits | ❌ | ✅ |
| supports damage/write-off/self-use | hacky | natural |
| audit for disputes | none | complete |

**Ledger.** `stock_movement` is append-only; on-hand is a `SUM`. Concurrency handled by making the
reserve/receive operations transactional with `SELECT ... FOR UPDATE` on the product row (or a
`stock_version` optimistic check). At your scale this is trivially fast and 100% correct.

## D4. Money handling

- **Integer paise everywhere.** No floats. `₹249.50` → `24950`.
- **One `payment` table** for four things: customer receipt, partner contribution, partner payout,
  refund. Same shape, one verification UI, one audit trail. This also kills the symmetric fraud on
  the partner side ("I already transferred my share").
- **The app never moves money.** It records what happened and prints instructions. No payouts API in
  v1.
- **Never let the fund go negative.** Settlement is blocked if central account cash < amount to
  distribute.

## D5. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript | one codebase, server actions, cheap hosting |
| UI | Tailwind + shadcn/ui | fast, consistent, mobile-first |
| DB | Postgres — Supabase (DB+Auth+Storage) or Neon | managed, free tier, real SQL with transactions |
| ORM | Drizzle | typed, light, plain SQL when needed |
| Auth | Auth.js with Google + email magic link | free, no password handling, real identity reduces abuse |
| Files | Supabase Storage or Vercel Blob | product images |
| Email | Resend | 3k/mo free, simple API |
| Ops ping | Telegram bot → partner group | free, instant, better than email for "new reservation" |
| Payments | manual UPI (v1) → Razorpay/Cashfree (phase 5) | ship now, automate when volume justifies |
| Hosting | Vercel | zero-ops |

**Deliberately not used:** microservices, Redis, a separate admin app, GraphQL, i18n, React Native.
Five people sharing a bulk order do not need any of it.

**Alternative if you want to avoid Vercel lock-in:** Astro/SvelteKit + Hetzner VPS. Only worth it if
someone enjoys running servers.
