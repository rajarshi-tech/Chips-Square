# Chips Square — Project Plan

> A shared-buy club storefront: partners pool money to buy discounted bulk stock, inventory is
> tracked properly, customers buy/reserve online, and every rupee splits fairly.

**Status:** building. Phase 0 complete, public storefront live on seed data.
**Read in this order:** this file → `docs/00-decisions.md` → `docs/01-data-model.md` →
`docs/02-reservations-and-payments.md` → `docs/03-product-data-sourcing.md` → `docs/04-roadmap.md`

---

## 1. What the business does today

1. Partners buy items in bulk at a discount (Blinkit, Flipkart Minutes, Zepto, local wholesale).
2. Total purchase cost is divided by the number of partners; each pays their share to whoever
   actually paid the store.
3. All sale earnings land in **one central account**.
4. When the stock of a lot is "cleared", total earnings are split evenly and distributed.
5. Inventory is tracked in a notes app. This is the thing that breaks first.

Two problems are hidden in step 4 that the app must fix:

- **Cost is already recovered separately.** Revenue is not profit. If you split *revenue* while
  stock is still on the shelf, you have paid out money for goods you still own. The split must be
  on **profit of a closed cycle**, and unsold stock must carry over as an asset.
- **"5 ways" is hardcoded.** Partners get added later. Shares must be **data snapshotted per
  purchase and per settlement**, never a constant in code.

## 2. Requirements

**Must have (v1)**

- Public catalog: current stock, MRP with strike-through, discounted price, savings.
- Admin-only inventory: add/edit products, record a bulk purchase, stock adjustments.
- Stock that cannot silently go wrong: append-only movement ledger + audit log.
- Partners ledger: who paid what, who owes whom, per-cycle profit split and settlement.
- Auth: customer (Google/email) and role-gated admin.
- Reservation with payment (UPI QR) that **cannot be abused** — see `docs/02`.
- Feedback / item-request form + admin inbox.

**Should have (v1.5)** — gateway auto-verification, refunds, receipts/invoices, low-stock alerts,
barcode scanning in the admin add-product form, Telegram/email notifications to partners.

**Won't have (v1)** — delivery/shipping, coupons, reviews, multi-warehouse, native mobile app,
automatic catalog import from Blinkit/Flipkart.

## 3. The five decisions that shape everything

| # | Decision | Recommendation |
|---|---|---|
| 1 | How to get product name + image | **Do it manually, but make manual fast.** Barcode → Open Food Facts lookup for name/brand/size/image, then you upload your own photo. No scraping of Blinkit/Flipkart. → `docs/03` |
| 2 | How to stop reservation abuse | **Invert the flow: hold the item for 10–15 min, pay first, then confirm.** Never reserve for free. Unique UTR + reconciliation window + reputation score. → `docs/02` |
| 3 | Inventory truth | **Append-only stock movement ledger.** Never a single mutable `qty` field. |
| 4 | Money | Integer **paise**, a single `Payment` table shared by customer receipts, partner contributions and payouts. Nothing auto-moves money — the app is a ledger + instructions. |
| 5 | Stack | Next.js 15 (App Router) + TypeScript + Tailwind/shadcn + Postgres (Supabase or Neon) + Drizzle + Resend email. Deploy on Vercel. |

## 4. Architecture at a glance

```
Browser (mobile-first PWA)
   │
   ├─ Public: /  /catalog  /product/:slug  /feedback  /how-it-works
   ├─ Customer: /me/orders  /pay/:orderCode
   └─ Admin: /admin/**  (role-gated: OWNER, ADMIN, PARTNER)
            │
      Next.js 15 on Vercel — Server Actions + Route Handlers
            │
   ┌────────┴─────────┬──────────────┬─────────────┬──────────────┐
 Postgres          Storage        Resend       Razorpay/      Telegram
 (Drizzle)         (images)       (email)      Cashfree       bot (ops ping)
                                                (phase 5)
```

One app, one deploy. No microservices. There is no ["backend"]() to scale — 5 partners and
maybe a few hundred customers.

## 5. Money model — canonical rules

All amounts stored as **integer paise** (`₹249.50` = `24950`). Displayed in ₹.

**Cost side (already how you work)**

- A `Purchase` = one bulk buy from one store on one date, with `delivery/packaging/other` fees.
- `PurchaseShare` rows are created at purchase time for each **active partner on that date**,
  storing `share_pct` and `amount_owed` as a snapshot. Adding partner #6 later does **not**
  rewrite history.
- Whoever paid the store is credited the full invoice total; the others owe their share to that
  person. Each transfer is a `Payment` row of kind `PARTNER_CONTRIBUTION` with an optional UTR.

**Revenue side**

- Every sale references a product with a **COGS snapshot** (`order_item.unit_cost_paise`) taken
  from the batch it came from. Historical profit never changes when costs change.
- `Cycle` = the unit of "we bought this batch of stuff, sold it, now settle". Not a calendar month.
- On settle:

```
revenue  = Σ fulfilled order totals in cycle
cogs     = Σ order_item.unit_cost × qty
expenses = delivery + packaging + transport + ads + misc for the cycle
profit   = revenue − cogs − expenses
closing_stock_value = Σ(remaining qty × weighted avg cost)   ← carried into next cycle
```

- Split `profit` by `CycleShare` (default equal across active partners, editable per cycle).
- **Guard rail:** a cycle can only be settled if `cash in central account ≥ profit to distribute`
  and remaining stock is either zero or explicitly carried over. This is what stops "we distributed
  money for goods still on the shelf".
- A partner who leaves keeps their claim on cycles not yet settled (`payout_after_cycle_id`).

## 6. Inventory model

`Product` (catalog truth) ≠ `PurchaseItem` (what you paid) ≠ `StockMovement` (what happened).

```
on_hand(product) = Σ stock_movement.qty_delta
available(product) = on_hand − Σ active reservations (HOLD + PAYMENT_PENDING)
```

Movement types: `PURCHASE +`, `SALE −`, `RETURN +`, `DAMAGE −`, `EXPIRY −`, `SELF_USE −`,
`ADJUSTMENT ±` (count correction, requires a note and is audit-logged).

Everything is derived, nothing is overwritten — so "why does stock say 3 when I have 5" always has
an answer in the log. Reservations consume `available`, not `on_hand`.

## 7. Pages and roles

**Roles:** `CUSTOMER` (default) · `PARTNER` (read finance, sees own balance) · `ADMIN` (inventory,
orders, feedback) · `OWNER` (everything, settings, settlements).

| Route | Who | Purpose |
|---|---|---|
| `/` | public | what we sell, how it works, trust signals |
| `/catalog` | public | grid, search, brand/category filter, discount badge, stock state |
| `/product/:slug` | public | MRP struck through, your price, savings %, qty stepper, Reserve |
| `/pay/:orderCode` | customer | amount, **UPI QR + intent link**, countdown, UTR input |
| `/me/orders` | customer | active holds with countdown, history, pickup code |
| `/feedback` | public | suggestion / item request, rate-limited |
| `/admin` | admin | dashboard: cash, stock value, low stock, holds expiring, unverified payments |
| `/admin/products` | admin | list, bulk edit price/discount, barcode scan, image upload |
| `/admin/purchases` | admin | record a bulk buy → auto-creates partner shares |
| `/admin/orders` | admin | tabs: awaiting payment / ready / fulfilled / expired, one-tap verify |
| `/admin/stock` | admin | adjustments + movement history |
| `/admin/cycles` | owner | open, close, settle, distribution preview |
| `/admin/partners` | owner | membership, shares, balances, mark transfer received |
| `/admin/feedback` | admin | inbox, item requests → "add to next purchase" |
| `/admin/settings` | owner | UPI ID, QR image, hold TTL, limits, store list, T&C text |
| `/admin/audit` | owner | every mutation, who/when/before/after |

## 8. Non-functional requirements

- **Mobile first.** Customers are on phones, in your building, on 4G.
- **Backups:** daily `pg_dump` to a private bucket, 30-day retention, and a tested restore.
- **Audit log** on every write to money and stock tables. Non-negotiable — it is your dispute
  resolver.
- **Rate limits + Cloudflare Turnstile** on feedback and reserve endpoints.
- **No secrets in the client.** UPI QR is an image; the UPI ID is public by nature.
- **Accessibility:** keyboard-reachable admin, so verification is one hand + tab key.

## 9. Cost estimate

| Item | Cost |
|---|---|
| Domain | ₹800/yr |
| Vercel Hobby | ₹0 (Pro ₹1,700/mo if needed) |
| Supabase free tier / Neon free | ₹0 (₹1,800/mo paid later) |
| Resend (3k emails/mo) | ₹0 |
| Payment gateway (phase 5) | ~2% of online sales |
| Scraper API (Blinkit) | **not used** — ₹1/credit and ₹30k/mo tiers are unjustifiable at your volume |

**Realistic running cost: ₹0–₹2,000/month.**

## 10. Roadmap summary

| Phase | Scope | ~Effort |
|---|---|---|
| 0 | Decisions, accounts, repo, schema, seed | 2 days |
| 1 | Auth + roles + catalog + product admin | 1 week |
| 2 | Purchases, stock ledger, cycles, partner ledger, settlement | 1–2 weeks |
| 3 | Reservation: hold TTL, UPI QR, UTR, verify queue, reputation | 1 week |
| 4 | Feedback + item requests + admin inbox | 3 days |
| 5 | Gateway auto-verification, refunds, receipts | 1 week |
| 6 | Polish: PWA, low-stock alerts, Telegram, labels | ongoing |

Details and acceptance criteria in `docs/04-roadmap.md`.

## 11. Risks and open questions

| Risk | Mitigation |
|---|---|
| Stock drift → disputes | ledger + adjustment-with-note + weekly physical count |
| Fake payment screenshots | never accept screenshots as proof; UTR + statement or gateway webhook |
| One partner holds the central account | written policy + this ledger + UPI-only (auditable) |
| Two partners buy in the same cycle, different discounts | per-batch unit cost; weighted average for reporting |
| Customers reserve and vanish | TTL + reputation + waitlist for scarce SKUs |
| GST / resale compliance | decide before launch: price inclusive of tax, receipts from phase 5 |
| Gateway onboarding needs PAN + bank + entity | start KYC early, it takes days |
| Free tier limits (Supabase pauses idle DB) | add a keep-alive cron or use Neon |

**Open questions for you** (answers change the build):

1. Do you have a registered entity/PAN/current account for Razorpay/Cashfree KYC, or shall v1 be
   manual-UPI-only? (v1 is designed to work either way.)
2. Are partners *customers* too (should a partner see the catalog as a customer)?
3. Is "cycle" per purchase batch, or a rolling pool you settle monthly? Plan assumes per batch.
4. Pickup only, or any delivery? Plan assumes pickup.
5. Who receives ops notifications — one phone, or a Telegram group?


---

## 12. Change log

Newest first. Anything that surprises a future reader belongs here, not in a commit message nobody
opens.

### Phase 0 complete — foundations
- Next.js **16.4** (not 15 — 16 is what `create-next-app` installs), React 19, Tailwind v4, Drizzle
  0.45. Docs said 15 because that was current when the plan was written.
- **Local dev runs on PGlite**, not a downloaded Postgres. There was no Docker and no `psql` on the
  dev machine; PGlite gives real SQL with zero install and the same migrations as production.
  It must stay in `serverExternalPackages` or `next build` fails — see `docs/05-runbook.md`.
- The database handle is a **lazy proxy**. Creating a connection at import time broke prerendering
  and leaked file locks on Windows.
- `cacheComponents` was removed from `next.config.ts`. With it on, every DB read needs an explicit
  cache boundary, and a cached catalogue that shows sold-out items is worse than a slower page.
- Added `stock_levels` as a cache of `SUM(stock_movements)` with weighted average cost. The plan
  said "derive everything"; deriving is still the rule, but the dashboard and settlement need stock
  *valuation* in one query, and a cache rebuilt from the ledger cannot drift.
- Added `waitlist_entries` to the schema in phase 0 (used in phase 3) so the first migration is the
  only one touching queue semantics.
- Product slugs are derived from `name + size`, not `brand + name + size` — brands are stored
  separately and the concatenation produced `lay-s-lay-s-classic-salted`.

### Decisions still open (blocking later phases)
1. Registered entity / PAN for gateway KYC, or manual UPI only for v1?
2. Are partners also customers in the UI?
3. Is a "cycle" one purchase batch, or a rolling monthly pool?
4. Pickup only? (assumed yes)
5. Who receives ops notifications — one phone or a Telegram group?
