# 05 — Runbook

Operational how-to. If you only read one section, read **Local setup** and **Migrations**.

---

## Local setup

```bash
git clone <repo> && cd "Chips Square"
npm install
npm run db:migrate     # creates ./.pglite and applies schema
npm run db:seed        # demo data: 5 partners, 12 products, one purchase, two sales
npm run user:password -- owner@chipssquare.in   # set a staff password
npm run dev            # http://localhost:3000
```

No database server, no Docker, no API keys. Local dev runs on **PGlite** (Postgres compiled to
WASM) with its data in `./.pglite`, which is gitignored.

## Switching to real Postgres

Put a connection string in `.env.local` (Next) and `.env` (scripts):

```
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

Then `npm run db:migrate`. Nothing else changes — the same Drizzle schema and migrations run against
either driver. Recommended hosts: Neon (free tier, serverless-friendly) or Supabase (adds auth and
storage if we want them later).

## Migrations

```bash
# 1. edit src/db/schema/*.ts
npm run db:generate      # writes drizzle/000N_<name>.sql + updates meta/
npm run db:migrate       # applies it
npm test && npm run build # 2. prove nothing broke
# 3. update docs/01-data-model.md in the SAME commit
```

Rules:

- Never hand-edit a file in `drizzle/`. Regenerate.
- Never delete an applied migration. Add a new one.
- Migrations are applied in order at boot by `scripts/migrate.ts`; production should run it as part
  of deploy (or as a separate job) before the new build takes traffic.

### Changing an enum

Postgres cannot add a value to an existing enum inside a transaction in older versions, and Drizzle
generates an `ALTER TYPE`. Current Postgres (14+) supports `ALTER TYPE ... ADD VALUE` but it cannot
be rolled back, so:

1. Add the value to `src/db/schema/enums.ts`.
2. `npm run db:generate` and read the SQL — if it drops and recreates the type, that would destroy
   data. Replace the generated statements with `ALTER TYPE <name> ADD VALUE '<VALUE>';` by hand
   **in the migration file only**, then apply.
3. If you must remove or reorder a value, that needs a new type + column rewrite. Ask before doing
   it.

## Seed and reset

```bash
npm run db:seed              # truncates everything, then loads demo data
npm run db:seed -- --force   # allow when DATABASE_URL points at a real database (DANGER)
npm run db:reset             # delete ./.pglite
npm run db:reset -- --force  # drop + recreate schema public on DATABASE_URL (DANGER)
```

Seed is idempotent in the sense that it always wipes first, so it is safe to re-run locally. It is
never safe to run against production.

## Verifying a build before shipping

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

All four must pass. Then `npm start` and click through `/`, `/catalog`, a product page, `/feedback`.
All routes are dynamic, so anything that works locally works deployed.

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `Error occurred prerendering page "/"` + `path argument must be of type string` | PGlite was bundled | keep `serverExternalPackages: ["@electric-sql/pglite", "postgres"]` in `next.config.ts` |
| Pages show no products | database empty or not migrated | `npm run db:migrate && npm run db:seed` |
| `EACCES`/file-lock errors on Windows | two dev servers holding `./.pglite` | stop the other server, or `npm run db:reset` |
| Seed prints `refusing without --force` | `DATABASE_URL` is set | intentional guard; pass `--force` only if you really mean it |
| Stock looks wrong | someone mutated a row by hand | the ledger is truth: check `stock_movements`, then call `refreshStockLevel` |
| A sale was entered wrong | human error | void it (`voided_at` + `RETURN` movements); never delete the row |
| Every page is 500 in production | `AUTH_SECRET` missing | it is required there (dev falls back silently); generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| Staff cannot sign in | no `password_hash` on the row | `npm run user:password -- <email>` |
| Locked out after 8 bad passwords | in-process throttle, 15-minute window | restart the server, or wait |
| `relation "…" does not exist` | migration not applied | `npm run db:migrate` |

## Reading the numbers (for the owner, not the dev)

- **Cash in the account** should never go below what you plan to distribute. The settlement screen
  blocks it; if the figure looks wrong, the problem is an unrecorded expense, not the app.
- **Stock value at cost** is what is physically on the shelf, valued at weighted average purchase
  cost. It is not money you have — it is money you have spent.
- **A cycle's profit** is `sales − cost of the units sold − expenses`. It does not include stock you
  still hold; that carries into the next cycle automatically.
- If a partner's balance looks wrong, open `/admin/audit` (once built) and read the history rather
  than editing a number.

## Backups

Local dev: unnecessary, `.pglite` is disposable.

Production: daily `pg_dump` to a private bucket, 30-day retention. **Test a restore** before launch,
not after. A backup you have never restored is a hope, not a backup.
