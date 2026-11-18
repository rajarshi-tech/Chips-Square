# 04 — Roadmap

Ordered so that a usable thing exists after phase 1 and the money problem is solved before
convenience features. Each phase ends with something you can actually use.

---

## Phase 0 — Foundations (2 days) ✅ done

- [ ] Decide the open questions in `PLAN.md` §11.  ← still open, needs the owner
- [ ] Accounts: GitHub repo, Vercel, Postgres (Neon/Supabase), Resend, domain, Telegram bot.  ← pending
- [x] `create-next-app` (TS, App Router, Tailwind v4), ESLint.
- [x] Drizzle setup, `.env.example`, migration workflow, PGlite for zero-install local Postgres.
- [x] Full schema as migration `0000_init`.
- [x] Seed script proving the numbers end to end (80 bought, 10 sold, 70 on hand, profit split 5 ways).
- [x] Money helpers (`rupeesToPaise`, `formatINR`, `pctOf`, `computeSellPrice`, `splitEvenly`) and
      UPI helpers with 25 unit tests.

**Done when:** `npm run dev` shows a page, `db:seed` runs clean, one test asserts `₹249.50 ↔ 24950`. ✅

## Phase 1 — Public shelf + product admin (1 week)

- [x] Public: `/`, `/catalog` (search, category filter, stock state, 4 sorts), `/product/:slug`,
      `/how-it-works`, `not-found`. Read-only — no cart, no reservation.
- [x] Price display: MRP struck through, price, savings %, discount badge, stock badge.
- [x] `on_hand` derived from the ledger via `src/lib/inventory.ts` + `stock_levels` cache.
- [x] Auth: email + password (scrypt), signed session cookie, 7-day expiry, `requireManager()` on
      every admin page and action, `/login`, sign out, login throttling. No OAuth, no email vendor.
- [x] `/admin` shell + navigation, protected by role, `/admin` overview (stock value, today's
      takings, recent sales, low stock). Unbuilt sections are labelled "soon", not linked.
- [x] `/admin/products`: list with search + low/out/archived tabs, create with barcode → Open Food
      Facts prefill, edit, archive/restore, duplicate detection (`brand+name+size`), live sell-price
      preview, frozen slugs.
- [x] `/admin/users` (owner-only): add accounts, roles, generated passwords shown once, revoke.
- [x] `/admin/stock`: on-hand list with low/out/archived tabs, per-product adjustment form that
      forces a reason (received-with-cost, damaged, expired, self-use, count fix), full movement
      history with actor and note, and "rebuild count from ledger". Units are never typed directly.
- [ ] Image upload pipeline → WebP, ≤100 KB, 1:1, served from own storage.
- [ ] Bulk discount apply + CSV import (nice-to-have, not needed for the first 100 SKUs).

**Done when:** you can add a real product from your shelf on a phone, set a discount, apply it to all
chips, and see it in the public catalogue with the correct count. You stop using the notes app for the
catalogue.

## Phase 2 — Purchases, partners, settlement (1–2 weeks) ← highest business value

- [ ] `/admin/purchases/new`: supplier, date, paid-by partner, line items (product, qty, unit cost,
      MRP), delivery/packaging fees, live total. On save, in one transaction: `PURCHASE` movements +
      `purchase_shares` snapshot for the partners active on that date.
- [ ] `/admin/partners`: membership (joined/left), default share, contribution ledger with a clear
      "A owes B ₹X" matrix, mark-transfer-received with optional UTR.
- [ ] `src/lib/settle.ts` + unit tests: revenue, cogs, expenses, profit, closing stock value.
- [ ] `/admin/cycles`: open, close, **preview** settlement (read-only computation), then finalise.
- [ ] `settlement_shares` distribution + mark-as-paid per partner.
- [ ] `/admin/expenses`: record a cost against the open cycle.

**Done when:** you can record one real bulk purchase, sell it all through the app, close the cycle,
and the split is arithmetically identical to what you would have done in the notes app — but auditable.

## Phase 3 — Counter sales (3–4 days) ✅ mostly done

- [x] `/admin/sales/new`: product type-ahead (only what is on the shelf), qty capped at on-hand,
      editable line price, method, buyer note. Usable one-handed.
- [x] Atomic write: sale + items + `SALE` movements + stock refresh, in one transaction. The on-hand
      check happens inside that transaction.
- [x] Void a sale with a required reason → `RETURN` movements; voided sales are excluded from revenue
      and from unit counts.
- [x] `/admin/sales`: today's takings, unit count, the day book, void inline.
- [ ] Idempotency, so a retried POST cannot create a second sale (the button disables; a retry is
      still possible).
- [ ] Receipt / printable slip.

**Done when:** a sale entered in the admin panel changes the public stock count on next load, and
voiding it puts the units back.

## Phase 4 — Feedback (3 days) — form done early

- [x] `/feedback`: type, message, optional requested item, optional contact; zod validation +
      honeypot. Captcha + per-IP rate limit still to do.
- [ ] `/admin/feedback` inbox sorted by votes, statuses, admin note.
- [ ] "Add to next purchase" from an item request → pre-filled product or purchase line.
- [ ] Weekly digest email to partners: new requests grouped by keyword.

## Phase 5 — Dashboard, audit, alerts (1 week)

- [ ] `/admin` dashboard: cash position, stock value at cost, revenue this cycle, top sellers,
      low stock, partners' outstanding balances, sales today.
- [ ] `/admin/audit`: every write to money and stock, with before/after JSON.
- [ ] Low-stock thresholds + daily digest (Telegram or email).
- [ ] Notification log so you can prove an email was attempted.

## Phase 6 — Polish (ongoing)

- [ ] Receipt printing / a printable slip per sale.
- [ ] Counter UPI QR showing the exact sale total (`buildUpiUri` already exists and is tested).
- [ ] PWA install, offline-tolerant catalogue.
- [ ] Real photography, brand identity, dark mode, empty states.
- [ ] Weekly backup restore drill.

---

## Sequencing rationale

- **Inventory before money.** If stock is wrong, every settlement is arguable.
- **Money before convenience.** Partner settlement is the thing you cannot do by hand reliably.
- **Sales before feedback.** Revenue feeds the split; feedback generates work.
- **Auth before any admin screen.** An unprotected `/admin` on a public URL is a data breach, not a
  shortcut.

## Estimated total

Phase 1–3 ≈ **3 weeks** of focused part-time work (a solo dev, some evenings). Phases 4–6 add 2 weeks.
Phase 1 alone is enough to stop the notes-app pain; phase 2 is enough to trust the split.
