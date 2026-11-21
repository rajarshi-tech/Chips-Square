# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository. Read this first, then
`PLAN.md`, then whichever `docs/` file matches your task.

---

## 1. What this project is

**Chips Square** — an inventory back-office with a public window, for a small Indian buying club.

- A handful of partners pool money to buy snacks/essentials in bulk from Blinkit, Flipkart Minutes,
  Zepto and local wholesale, at discount.
- Purchase cost is split across partners; sales revenue lands in one central account; at the end of
  a batch ("cycle") the **profit** is split and paid out.
- **Everyone can see live stock. Only admins can change it.** An admin records a sale at the counter
  when goods leave the shop. There is no cart, no reservation and no online payment.

The product is small on purpose: ~5 admins, a few hundred customers, a few hundred SKUs. Prefer the
boring solution. Every extra dependency has to pay for itself.

## 2. Commands

```bash
npm run dev            # http://localhost:3000 (PGlite, no setup needed)
npm run build          # production build; must pass before any commit
npm start              # run the production build
npm run typecheck      # next typegen && tsc --noEmit
npm run lint           # eslint
npm test               # vitest run (unit tests)
npm run db:generate    # schema change -> new SQL migration in ./drizzle
npm run db:migrate     # apply pending migrations
npm run db:seed        # wipe + load demo data (5 partners, 12 products, 2 sales)
npm run db:reset       # delete the local database entirely
npm run db:studio      # drizzle studio
npm run user:create   -- <email> --role OWNER --generate   # first account / new people
npm run user:password -- <email> [--generate]              # reset a password
```

There is **no external database to install**. Without `DATABASE_URL`, everything runs on PGlite in
`./.pglite`. Set `DATABASE_URL` to use real Postgres (that is what production does).

`npm run db:reset && npm run db:migrate && npm run db:seed` is the "I broke my local data" command.

## 3. Layout

```
src/app/                     routes (App Router, server components by default)
  layout.tsx                 shell, force-dynamic, loads settings
  page.tsx                   home
  catalog/                   filtered grid (searchParams driven)
  product/[slug]/            detail
  how-it-works/, feedback/   static-ish content; feedback has a server action
  login/                     email + password form, redirects to /admin on success
  logout/actions.ts          sign out (a POST-style action, never a GET link)
  admin/                     guarded back office; layout.tsx is the guard + nav
    products/                list, create (barcode -> Open Food Facts), edit, archive
    stock/                   on-hand list, per-product adjustment form + ledger history
    sales/                   day book; new sale from a tap-to-add shelf grid; void with a reason
    users/                   owner-only: add people, roles, passwords, revoke
src/components/              presentational components (no DB access)
src/lib/
  money.ts                   integer-paise maths. The most important file in the repo.
  inventory.ts               stock ledger writes, on-hand, stock valuation
  queries/products.ts        the read model the storefront pages consume
  auth/password.ts           scrypt hash/verify (node:crypto, no dependency)
  auth/token.ts              signed session cookie: sign + verify (pure, tested)
  auth/session.ts            cookie <-> user, getSessionUser, requireUser, requireManager
  auth/throttle.ts           in-process login rate limit
  catalog-admin.ts           product writes: slug rules, duplicate guard, archive
  stock-rules.ts             reason -> movement mapping (pure, tested); sets every sign
  stock-admin.ts             stock reads + adjustStock, the single write path for units
  sales.ts                   createSale / voidSale: revenue + SALE/RETURN movements, one transaction
  queries/sellable.ts        the counter form's shelf (every in-stock product, one payload)
  users-admin.ts             account writes: create, role, revoke, last-owner guard
  openfoodfacts.ts           barcode -> name/brand/size prefill (never the source of truth)
  queries/dashboard.ts       admin overview read model
  settings.ts                cached settings row with defaults
  upi.ts                     UPI deep links, UTR normalisation (counter QR, partner transfers)
  codes.ts                   sale codes, pickup/short codes, slugs
src/db/
  index.ts                   lazy db singleton (PGlite or postgres-js)
  schema/*.ts                tables, split by domain, re-exported from index.ts
scripts/                     migrate, seed, reset — run with tsx
drizzle/                     generated SQL migrations. NEVER hand-edit; regenerate.
docs/                        the plan and the decisions
```

## 4. Non-negotiable invariants

Break one of these and the money or the stock becomes wrong. All of them are enforced in code and
covered in `docs/01-data-model.md`.

1. **Money is integer paise.** Columns end in `_paise`. No floats, anywhere, ever. Use
   `src/lib/money.ts` (`rupeesToPaise`, `formatINR`, `pctOf`, `splitEvenly`). Do not do `* 100` by
   hand in a component.
2. **Splits use `splitEvenly`, never `/ n`.** ₹1001 ÷ 5 must lose zero paise.
   `splitEvenly` sums exactly to the total.
3. **`stock_movements` is append-only.** No UPDATE, no DELETE. A correction is a new opposite
   movement with a note. On-hand is `SUM(qty_delta)`; `stock_levels` is a cache rebuilt by
   `refreshStockLevel`. `DAMAGE|EXPIRY|SELF_USE|ADJUSTMENT` require a note; `PURCHASE|SALE` require
   `unit_cost_paise` (the COGS snapshot).
4. **On-hand is the only stock number.** `on_hand = SUM(stock_movements.qty_delta)`, and that is what
   customers see. Nothing is held aside for anyone — there is no `available` versus `on_hand` split,
   because there are no reservations. Do not add one back.
5. **A cycle settles on profit, not revenue:** `profit = revenue − cogs − expenses`. Unsold stock is
   carried forward as `closing_stock_value_paise`, never distributed. Never let the central account
   cash go below the amount being distributed.
6. **Revenue comes from `sales` rows written by an admin, never from a checkout.** Sales are voidable
   (`voided_at` + `RETURN` movements), never deletable.
7. **`payments.utr` is UNIQUE.** One UPI reference can never settle two obligations. Screenshots are
   evidence, never proof.
8. **Nothing auto-moves money.** The app is a ledger plus instructions. No payout APIs.
9. **Every write to money or stock goes through an audit entry** once `src/lib/audit.ts` exists
   (phase 2). If it is not logged, it did not happen.
10. **Partner shares are snapshots.** `purchase_shares` and `settlement_shares` store the percentage
    at the time. Adding a partner later must never rewrite history.
11. **No scraping Blinkit/Flipkart.** Product data is entered by an admin, optionally pre-filled from
    Open Food Facts (attribution is required and already in the footer). See `docs/03`.
12. **Auth is one signed cookie, no vendor.** `src/lib/auth/*`, ~200 lines, no OAuth app and no
    email service. Do not add NextAuth-style stacks, social login or magic links: five staff, set up
    in person with `npm run user:password`. Do not add self-service signup — every account is created
    deliberately. `AUTH_SECRET` (32+ chars) is **required** in production; dev falls back to an
    insecure constant so `npm run dev` works with no setup.
13. **Every admin page and admin server action calls `requireManager()`.** The `/admin` layout guard
    covers pages only — server actions are separate entry points and a layout cannot protect them.
    Authorisation is checked server-side, always; hiding a button is not access control.
14. **Two roles only: `OWNER` and `ADMIN`.** Owner manages accounts and settlements; admins run the
    whole shop. Do not add `PARTNER`/`CUSTOMER` back — the shelf is public and the five people share
    the work. Account management is `requireOwner()` on the page *and* the action. `LastOwnerError`
    is absolute: the last owner can never be demoted, revoked or deleted, and nobody can delete
    themselves. Revoke (clear `password_hash`) keeps a name on past records; delete removes the row
    and the name with it. See `docs/06-roles-and-accounts.md`.
15. **Products are archived, never deleted**, and a product's `slug` is frozen after creation — a
    rename must not break a shared link. Same-brand-same-name-same-size is rejected as a duplicate
    (unique index `products_identity_idx`); the error surfaces as `DuplicateProductError`.
16. **Stock is never typed into the product form, and there is no bare "set quantity".** Creating a
    product leaves `on_hand` at 0. Units move only through `adjustStock` (`src/lib/stock-admin.ts`),
    which forces a reason: Received (PURCHASE + cost), Damaged/Expired/Self-use (note required), or
    Count fix (ADJUSTMENT, note required, signed quantity). Signs are applied by `resolveMovement`,
    never typed by hand, and the transaction refuses to go below zero. Writing a number directly
    would break both the ledger and the settlement cost basis.
17. **No reservations, holds, carts or online payments.** This was designed, built, then removed at
    the owner's request because it was solving the wrong problem. Read `docs/02 §1` before proposing
    anything adjacent. If pre-orders are ever genuinely needed, the only acceptable shape is
    pay-first with a signed gateway webhook — never hold stock for an unpaid order.

## 5. Conventions

- **Server components by default.** Add `"use client"` only for local interaction state (qty
  steppers, menus). Mutations go in `actions.ts` files marked `"use server"`, validate with zod.
- **All routes are dynamic** (`export const dynamic = "force-dynamic"` in the root layout). Do not
  add caching around stock or prices without an invalidation story.
- **DTOs over raw rows.** Pages consume `src/lib/queries/*`, never `db.select()` directly.
- **Types come from the schema**: `typeof products.$inferSelect`. Do not hand-write row types.
- **Dates**: `timestamptz` in UTC; `date` columns take `YYYY-MM-DD` strings, not `Date` objects.
  Display in IST.
- **Copy**: plain English, no exclamation marks, no "Oops". Say what happened and what it costs.
  Prices always render through `<Price>` so MRP-strikethrough stays consistent.
- **Accessibility**: every interactive element is keyboard reachable and has a visible focus ring;
  icon-only buttons carry `aria-label`.
- **Mobile first.** Test at 360px wide. 44px minimum tap targets.
- **Comments explain *why*.** Do not narrate `for` loops.

## 6. Workflow for a change

1. Read the relevant `docs/` file. If a decision is missing, add it there before writing code.
2. Schema change → edit `src/db/schema/*.ts` → `npm run db:generate` → `npm run db:migrate` →
   update `docs/01-data-model.md` in the same commit.
3. Business rule → put it in `src/lib/` with a unit test. UI never owns a rule.
4. Run `npm run typecheck && npm run lint && npm test && npm run build`.
5. Commit with a scoped message (`feat(inventory): …`, `fix(sales): …`, `docs: …`). One logical
   change per commit.
6. Tick the matching box in `docs/04-roadmap.md` and note anything surprising in `PLAN.md` §12.

## 7. Current state

**Public shelf** (read-only): home, catalogue, product, how-it-works, feedback form.

**Back office**: `/login`, `/admin` overview, `/admin/products` (create with barcode prefill, edit,
archive), `/admin/stock` (adjustments with a forced reason, ledger history, rebuild-from-ledger),
`/admin/users` (owner-only: add people, roles, passwords, revoke). `npm run user:create` creates the
first owner, because `/admin/users` needs one to open.

Not built yet: purchases, cycles/settlement, feedback inbox. Those nav items are labelled "soon"
rather than linked to a dead route.

**Sales**: `/admin/sales` day book with today's takings. `/admin/sales/new` is the whole in-stock
shelf as tap-to-add tiles (qty capped at what is on the shelf, price editable per line, a price
change shows as "was ₹x" on the line and lands in the sale's `discount_paise`), and void-with-reason
returns units through `RETURN` movements. Each line snapshots `unit_cost_paise`, so COGS is frozen.

The product page shows stock and "ask at the counter" — no buy button, by design.

Build order is product admin → phase 2 (purchases, settlement) → phase 3 (counter sales).
Do not build sales recording before settlement maths exists, because a sale's whole purpose here is
feeding the profit split.

## 8. Known traps

- PGlite must stay in `serverExternalPackages` (see `next.config.ts`); bundling it breaks the build.
- Never `import "@/db"` from a Client Component — it will try to open a database in the browser.
- `db` is a lazy proxy: no query runs at import time. Keep it that way.
- Changing a `pgEnum` needs a real migration (PG cannot alter enum values inside a transaction).
  Steps in `docs/05-runbook.md`.
- `npm run db:seed` truncates everything and refuses to run against `DATABASE_URL` without
  `--force`. Never wire it into anything automatic.
- Migration history was squashed once (fresh `0000_init`, 21 tables) while reservations were removed.
  Do not squash again now that real data could exist.
- Vitest shares the `@/*` alias via `vitest.config.ts`; a new path alias needs adding there too.
