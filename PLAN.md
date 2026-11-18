# Chips Square — Project Plan

> A shared-buy club: partners pool money to buy discounted bulk stock, admins keep the inventory
> honest, everyone else can see exactly what is in stock, and every rupee splits fairly.

**Status:** building. Phase 0 complete, public read-only shelf live on seed data.
**Read in this order:** this file → `docs/00-decisions.md` → `docs/01-data-model.md` →
`docs/02-sales-and-money.md` → `docs/03-product-data-sourcing.md` → `docs/04-roadmap.md`

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

**Must have (v1)** — this is an **inventory back-office with a public window**, not a shop.

- Public, read-only shelf: live stock counts, MRP with strike-through, discounted price, savings.
  No cart, no account, no reservation. → `docs/02 §1`
- Admin-only inventory: add/edit products, record a bulk purchase, record a counter sale, adjustments.
- Stock that cannot silently go wrong: append-only movement ledger + audit log.
- Partners ledger: who paid what, who owes whom, per-cycle profit split and settlement.
- Auth: role-gated admin (`OWNER`, `ADMIN`, `PARTNER`) and an optional read-only customer account.
- Feedback / item-request form + admin inbox.

**Should have (v1.5)** — receipts, low-stock alerts, barcode scanning in the add-product form,
Telegram/email notifications, a counter UPI QR showing the sale total.

**Won't have (v1)** — reservations, holds, carts, online payments, delivery/shipping, coupons,
reviews, multi-warehouse, native app, automatic catalog import from Blinkit/Flipkart.

## 3. The five decisions that shape everything

| # | Decision | Recommendation |
|---|---|---|
| 1 | How to get product name + image | **Do it manually, but make manual fast.** Barcode → Open Food Facts lookup for name/brand/size/image, then you upload your own photo. No scraping of Blinkit/Flipkart. → `docs/03` |
| 2 | Selling: reservations or not | **No reservations.** Customers see stock; an admin records the sale at the counter. The hold-then-verify flow was cut because it created the abuse problem it existed to solve. → `docs/02 §1` |
| 3 | Inventory truth | **Append-only stock movement ledger.** Never a single mutable `qty` field. |
| 4 | Money | Integer **paise**, one `payments` table for partner contributions and payouts only. Nothing auto-moves money — the app is a ledger + instructions. |
| 5 | Stack | Next.js 16 (App Router) + TypeScript + Tailwind v4 + Postgres (Drizzle, PGlite locally) + Resend email. Deploy on Vercel. |

## 4. Architecture at a glance

```
Browser (mobile-first PWA)
   │
   ├─ Public (read-only): /  /catalog  /product/:slug  /feedback  /how-it-works
   └─ Admin: /admin/**  (role-gated: OWNER, ADMIN, PARTNER)
            │
      Next.js 16 on Vercel — Server Actions + Route Handlers
            │
   ┌────────┴─────────┬──────────────┬─────────────┐
 Postgres          Storage        Resend       Telegram bot
 (Drizzle)         (images)       (email)      (ops ping)
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

- Revenue comes from **sales recorded by an admin at the counter** — there is no checkout.
- Every sale line carries a **COGS snapshot** (`sale_items.unit_cost_paise`) from the ledger's
  weighted average. Historical profit never changes when costs change.
- A sale is never deleted: a mistake sets `voided_at` and writes `RETURN` movements, so the ledger
  still explains the number.
- `Cycle` = the unit of "we bought this batch of stuff, sold it, now settle". Not a calendar month.
- On settle:

```
revenue  = Σ sales.total_paise where voided_at is null, in cycle
cogs     = Σ sale_items.unit_cost_paise × qty
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
```

That is the only stock number in the system — it is what customers see and what the admin edits
against. Nothing is held aside for anyone.

Movement types: `PURCHASE +`, `SALE −`, `RETURN +`, `DAMAGE −`, `EXPIRY −`, `SELF_USE −`,
`ADJUSTMENT ±` (count correction, requires a note and is audit-logged).

Everything is derived, nothing is overwritten — so "why does stock say 3 when I have 5" always has
an answer in the log.

## 7. Pages and roles

**Roles:** `CUSTOMER` (default, read-only) · `PARTNER` (read finance, sees own balance) · `ADMIN`
(inventory, sales, feedback) · `OWNER` (everything, settings, settlements).

| Route | Who | Purpose |
|---|---|---|
| `/` | public | what we sell, how it works, trust signals |
| `/catalog` | public | grid, search, category filter, discount badge, live stock state |
| `/product/:slug` | public | MRP struck through, your price, savings %, exact on-hand count |
| `/feedback` | public | suggestion / item request, rate-limited |
| `/admin` | admin | dashboard: cash, stock value, low stock, today's sales, unread feedback |
| `/admin/products` | admin | list, bulk edit price/discount, barcode scan, image upload |
| `/admin/purchases` | admin | record a bulk buy → auto-creates partner shares |
| `/admin/sales` | admin | record a counter sale, void a mistake, see the day's takings |
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
- **Rate limits + Cloudflare Turnstile** on the feedback endpoint.
- **No secrets in the client.** The UPI ID is public by nature; nothing else is.
- **Accessibility:** keyboard-reachable admin, so recording a sale is one hand + tab key.

## 9. Cost estimate

| Item | Cost |
|---|---|
| Domain | ₹800/yr |
| Vercel Hobby | ₹0 (Pro ₹1,700/mo if needed) |
| Supabase free tier / Neon free | ₹0 (₹1,800/mo paid later) |
| Resend (3k emails/mo) | ₹0 |
| Scraper API (Blinkit) | **not used** — ₹1/credit and ₹30k/mo tiers are unjustifiable at your volume |

**Realistic running cost: ₹0–₹2,000/month.**

## 10. Roadmap summary

| Phase | Scope | ~Effort |
|---|---|---|
| 0 | Decisions, accounts, repo, schema, seed | 2 days |
| 1 | Auth + roles + public shelf + product admin | 1 week |
| 2 | Purchases, stock ledger, cycles, partner ledger, settlement | 1–2 weeks |
| 3 | Counter sales recording + void + day book | 3–4 days |
| 4 | Feedback + item requests + admin inbox | 3 days |
| 5 | Dashboard, audit view, low-stock alerts, notifications | 1 week |
| 6 | Polish: PWA, barcode scanning, receipts, labels | ongoing |

Details and acceptance criteria in `docs/04-roadmap.md`.

## 11. Risks and open questions

| Risk | Mitigation |
|---|---|
| Stock drift → disputes | ledger + adjustment-with-note + weekly physical count |
| A partner claims a transfer they did not make | `payments.utr` unique + statement check; screenshots are evidence only |
| One partner holds the central account | written policy + this ledger + UPI-only (auditable) |
| Two partners buy in the same cycle, different discounts | per-batch unit cost; weighted average for reporting |
| A sale is entered wrong | sales are voidable, never deletable; the ledger keeps the trail |
| Someone asks for "a small reservation feature" | read `docs/02 §1` first — it was removed on purpose |
| GST / resale compliance | decide before launch: prices are inclusive of tax |
| Free tier limits (Supabase pauses idle DB) | add a keep-alive cron or use Neon |

**Open questions for you** (answers change the build):

1. Are partners also buyers in the UI, or purely financial?
2. Is "cycle" per purchase batch, or a rolling pool you settle monthly? Plan assumes per batch.
3. Should the public shelf hide out-of-stock items, or show them as "out of stock"? (Settings flag
   exists, defaults to showing them.)
4. Who receives ops notifications — one phone, or a Telegram group?
5. Does an admin need to record a sale on a phone at the counter, or only on a desktop afterwards?


---

## 12. Change log

Newest first. Anything that surprises a future reader belongs here, not in a commit message nobody
opens.

### Auth: email + password, hand-rolled, no vendor

Chose the simplest thing that still identifies individuals, after weighing Google OAuth, email magic
links and a shared password.

- **Google OAuth**: a Cloud Console project, a consent screen, a client secret to rotate, and the
  app breaks for anyone without a Google account. Setup cost, zero benefit at five users.
- **Magic links**: needs an email vendor (Resend), a domain to send from, and a token table — for a
  club whose members are standing in the same room.
- **Shared password**: one string, no setup. Rejected because `sales.created_by` and the audit trail
  need an actor, and one person leaving would force rotating the password for everyone.
- **Chosen: email + password.** `users.password_hash` (scrypt from `node:crypto`, self-describing
  string so parameters can be raised later). A session is an HMAC-signed cookie holding a user id and
  an expiry — verified by `src/lib/auth/token.ts`, which is pure and unit tested (8 tests: tampered
  payload, wrong secret, expiry, malformed input). No dependency added.
- Login is throttled in-process (8 failures / 15 min). Unknown emails are verified against a dummy
  hash so response time does not reveal which accounts exist. One generic error message.
- No signup and no password reset by design; `npm run user:password -- <email>` is the whole flow.
- `AUTH_SECRET` is required in production and fails loudly; dev falls back to a fixed string so
  `npm run dev` still needs no setup.
- Strength that mattered more than the choice: the guard is in `/admin/layout.tsx` **and** in each
  action via `requireManager()`. Verified with real cookies: anon → `/login`, forged → `/login`,
  `CUSTOMER` → `/`, `ADMIN` → 200.

### Reservations removed — the product is inventory management

Requested change, and the right one: **users can only see stock; admins do the managing.**

- Deleted `orders`, `order_items`, `waitlist_entries`, the hold TTL, the reputation counters on
  `users`, and every reservation setting. The state machine went from eight states to two.
- `payments` no longer records customer receipts at all — it is the partner ledger only. A counter
  sale carries its own `method`.
- Added `sales` + `sale_items`, written by an admin when goods leave the counter. Revenue still has
  to exist, because the profit split depends on it; it just comes from a human instead of a checkout.
- `stock_movements.order_id` became `sale_id`.
- Migration history was **squashed** into a fresh `0000_init` (21 tables). Safe because the project
  has only ever held seed data; from now on, migrations are append-only.
- `docs/02-reservations-and-payments.md` is gone. `docs/02-sales-and-money.md` replaces it and keeps
  the reasoning for the removal in §1, so nobody re-invents it.
- Seed now proves the numbers end to end: 80 bought, 10 sold, 70 on hand, revenue ₹425.30, profit
  ₹33.80, split ₹6.76 × 5.

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
- Added `stock_levels` as a cache of `SUM(stock_movements)` with weighted average cost. Deriving is
  still the rule, but the dashboard and settlement need stock *valuation* in one query, and a cache
  rebuilt from the ledger cannot drift.
- Product slugs are derived from `name + size`, not `brand + name + size` — brands are stored
  separately and the concatenation produced `lay-s-lay-s-classic-salted`.

### Decisions still open
1. Are partners also buyers in the UI, or purely financial?
2. Is a "cycle" one purchase batch, or a rolling monthly pool?
3. Hide out-of-stock items from the public shelf, or show them? (settings flag exists)
4. Who receives ops notifications — one phone or a Telegram group?
5. Does an admin record sales on a phone at the counter, or on a desktop afterwards?
