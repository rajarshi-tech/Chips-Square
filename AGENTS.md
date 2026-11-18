# AGENTS.md

Instructions for AI coding agents (and humans) working in this repository. Read this first, then
`PLAN.md`, then whichever `docs/` file matches your task.

---

## 1. What this project is

**Chips Square** — a storefront and back-office for a small Indian buying club.

- A handful of partners pool money to buy snacks/essentials in bulk from Blinkit, Flipkart Minutes,
  Zepto and local wholesale, at discount.
- Purchase cost is split across partners; sales revenue lands in one central account; at the end of
  a batch ("cycle") the **profit** is split and paid out.
- Customers browse live stock and reserve items, pay by UPI, and collect at the counter.

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
npm run db:seed        # wipe + load demo data (5 partners, 12 products, orders)
npm run db:reset       # delete the local database entirely
npm run db:studio      # drizzle studio
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
  feedback/actions.ts        "use server" — the ONLY way forms write to the DB
src/components/              presentational components (no DB access)
src/lib/
  money.ts                   integer-paise maths. The most important file in the repo.
  inventory.ts               stock ledger writes + derived availability
  queries/products.ts        the read model the storefront pages consume
  settings.ts                cached settings row with defaults
  upi.ts                     UPI deep links, UTR normalisation
  codes.ts                   order codes, pickup codes, slugs
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
4. **Availability is derived, never stored naively:**
   `available = on_hand − Σ(open reservations)`. Open = `HOLD`/`PAYMENT_PENDING` whose
   `hold_expires_at` is in the future, plus `PAID`/`READY`. See `getStockRows()`.
5. **A cycle settles on profit, not revenue:** `profit = revenue − cogs − expenses`. Unsold stock is
   carried forward as `closing_stock_value_paise`, never distributed. Never let the central account
   cash go below the amount being distributed.
6. **`payments.utr` is UNIQUE.** One UPI reference can never settle two obligations. Screenshots are
   evidence, never proof.
7. **Nothing auto-moves money.** The app is a ledger plus instructions. No payout APIs.
8. **Every write to money or stock goes through an audit entry** once `src/lib/audit.ts` exists
   (phase 2). If it is not logged, it did not happen.
9. **Partner shares are snapshots.** `purchase_shares` and `settlement_shares` store the percentage
   at the time. Adding a partner later must never rewrite history.
10. **No scraping Blinkit/Flipkart.** Product data is entered by an admin, optionally pre-filled from
    Open Food Facts (attribution is required and already in the footer). See `docs/03`.

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
5. Commit with a scoped message (`feat(inventory): …`, `fix(orders): …`, `docs: …`). One logical
   change per commit.
6. Tick the matching box in `docs/04-roadmap.md` and note anything surprising in `PLAN.md` §12.

## 7. Current state

Phase 0 and the front half of Phase 1 are done: schema (22 tables), migrations, seed, money/UPI/
inventory libraries with tests, and a live public storefront (home, catalog, product, how-it-works,
working feedback form). Reservations, auth and the admin area are **not built yet** — the "Reserve"
button is deliberately disabled so the UI never promises something that does not exist.

Do not start Phase 3 (reservations/payments) before Phase 2 (purchases, stock ledger wiring, cycles,
settlement), because reservation profit depends on cycle settlement being correct.

## 8. Known traps

- PGlite must stay in `serverExternalPackages` (see `next.config.ts`); bundling it breaks the build.
- Never `import "@/db"` from a Client Component — it will try to open a database in the browser.
- `db` is a lazy proxy: no query runs at import time. Keep it that way.
- Changing a `pgEnum` needs a real migration (PG cannot alter enum values inside a transaction).
  Steps in `docs/05-runbook.md`.
- `npm run db:seed` truncates everything and refuses to run against `DATABASE_URL` without
  `--force`. Never wire it into anything automatic.
- Vitest shares the `@/*` alias via `vitest.config.ts`; a new path alias needs adding there too.
