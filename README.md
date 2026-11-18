# Chips Square

Storefront and back-office for a small buying club: partners pool money to buy snacks and essentials
in bulk at discount, stock is tracked properly, customers reserve online and pay by UPI, and the
profit of each batch is split fairly.

**Status:** early. Public storefront is live on seed data; reservations, auth and the admin area are
next. See [`PLAN.md`](./PLAN.md) and [`docs/04-roadmap.md`](./docs/04-roadmap.md).

## Quick start

```bash
npm install
npm run db:migrate      # creates the local database (PGlite — nothing to install)
npm run db:seed         # demo partners, products, orders
npm run dev             # http://localhost:3000
```

## What works today

| Route | What it does |
|---|---|
| `/` | hero, biggest discounts, how it works |
| `/catalog` | live stock, search, category filter, 4 sort modes |
| `/product/[slug]` | MRP struck through, our price, saving, real availability |
| `/how-it-works` | the rules: holds, payment verification, fair use |
| `/feedback` | working item-request / feedback form (server action) |

Prices and availability come from the database, not fixtures. `available` is
`on hand − open reservations`, so an item held by someone else shows as reserved.

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
| [PLAN.md](./PLAN.md) | the plan: requirements, money model, pages, risks |
| [docs/00-decisions.md](./docs/00-decisions.md) | why the stack, why manual product data, why pay-first |
| [docs/01-data-model.md](./docs/01-data-model.md) | every table, derived stock queries, settlement maths |
| [docs/02-reservations-and-payments.md](./docs/02-reservations-and-payments.md) | the abuse analysis and the TTL/UTR design |
| [docs/03-product-data-sourcing.md](./docs/03-product-data-sourcing.md) | why we do not scrape Blinkit/Flipkart |
| [docs/04-roadmap.md](./docs/04-roadmap.md) | phases and acceptance criteria |
| [docs/05-runbook.md](./docs/05-runbook.md) | setup, migrations, troubleshooting |

## Contributing

Read `AGENTS.md` §4 before touching money or stock. The short version: integer paise, append-only
stock ledger, derived availability, splits via `splitEvenly`, and never trust a payment screenshot.
