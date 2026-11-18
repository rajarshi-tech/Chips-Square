# Chips Square

Inventory back-office with a public window, for a small buying club: partners pool money to buy
snacks and essentials in bulk at discount, admins keep the stock count honest, everyone can see what
is available, and the profit of each batch is split fairly.

**What it is:** admins manage inventory; users only look. No cart, no reservation, no online payment —
see [`docs/02-sales-and-money.md`](./docs/02-sales-and-money.md) §1 for why.

**Status:** early. The public read-only shelf and staff sign-in are live on seed data; product admin,
purchases, settlement and counter sales are next. See [`docs/04-roadmap.md`](./docs/04-roadmap.md).

## Quick start

```bash
npm install
npm run db:migrate      # creates the local database (PGlite — nothing to install)
npm run db:seed         # demo partners, products, a bulk purchase and two sales
npm run dev             # http://localhost:3000
```

Then sign in at `/login` as `owner@chipssquare.in` / `chips-demo-2026` (seed data only). No OAuth
app, no email service — passwords are set with `npm run user:password -- <email>`.

## What works today

| Route | What it does |
|---|---|
| `/` | hero, biggest discounts, how it works, live unit count |
| `/catalog` | live stock, search, category filter, 4 sort modes |
| `/product/[slug]` | MRP struck through, our price, saving, exact on-hand count |
| `/how-it-works` | the rules: pricing, stock counts, buying, returns |
| `/feedback` | working item-request / feedback form (server action) |
| `/login` | staff sign-in (email + password) |
| `/admin` | guarded overview: stock value, today's takings, recent sales, low stock |
| `/admin/products` | list, add (barcode → Open Food Facts prefill), edit, archive |
| `/admin/users` | owner-only: add admins/partners, set roles, reset passwords, revoke |

Stock and prices come from the database, not fixtures. Every number is derived from an append-only
`stock_movements` ledger, so a count can always be explained.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · Postgres via Drizzle ORM ·
PGlite for local dev · Vitest. Deploys to Vercel.

## Scripts

```bash
npm run dev | build | start
npm run typecheck | lint | test
npm run db:generate | db:migrate | db:seed | db:reset | db:studio
```

## Docs

| File | Contents |
|---|---|
| [AGENTS.md](./AGENTS.md) | rules and invariants for anyone (human or AI) editing this repo |
| [PLAN.md](./PLAN.md) | the plan: requirements, money model, pages, risks, change log |
| [docs/00-decisions.md](./docs/00-decisions.md) | why the stack, why manual product data, why no reservations |
| [docs/01-data-model.md](./docs/01-data-model.md) | every table, derived stock queries, settlement maths |
| [docs/02-sales-and-money.md](./docs/02-sales-and-money.md) | recording a sale, voiding, partner money |
| [docs/06-roles-and-accounts.md](./docs/06-roles-and-accounts.md) | one owner onboards admins; why roles are not equal |
| [docs/03-product-data-sourcing.md](./docs/03-product-data-sourcing.md) | why we do not scrape Blinkit/Flipkart |
| [docs/04-roadmap.md](./docs/04-roadmap.md) | phases and acceptance criteria |
| [docs/05-runbook.md](./docs/05-runbook.md) | setup, migrations, troubleshooting |

## Contributing

Read `AGENTS.md` §4 before touching money or stock. The short version: integer paise, append-only
stock ledger, on-hand is the only stock number, splits via `splitEvenly`, and no reservation feature.
