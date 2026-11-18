# 04 — Roadmap

Ordered so that a usable thing exists after phase 1 and the money problem is solved before the
payment problem. Each phase ends with something you can actually use.

---

## Phase 0 — Foundations (2 days)

- [ ] Decide the open questions in `PLAN.md` §11.
- [ ] Accounts: GitHub repo, Vercel, Supabase (or Neon), Resend, domain, Telegram bot token.
- [ ] `create-next-app` (TS, App Router, Tailwind), shadcn/ui init, ESLint + Prettier.
- [ ] Drizzle setup, `.env.example`, migration workflow (`drizzle-kit generate` + `migrate`).
- [ ] Full schema from `docs/01-data-model.md` as migration #1.
- [ ] Seed script (5 partners, owner user, settings, 10 products, 1 purchase, 1 settled cycle).
- [ ] Money helpers: `formatINR(paise)`, `parseINR(str)`, `roundPaise()`, `upiIntent({amount, code})`.
  Unit tests for all of them — this is the code most likely to be subtly wrong.

**Done when:** `npm run dev` shows a page, `db:seed` runs clean, one test asserts `₹249.50 ↔ 24950`.

## Phase 1 — Catalog + admin inventory (1 week)

- [ ] Auth (Google + email magic link), `users.role`, `requireRole()` guard on every admin route.
- [ ] Public: `/`, `/catalog` (search, brand/category filter, stock state), `/product/:slug`.
- [ ] Price display: MRP struck through, price, savings %, discount badge.
- [ ] Admin `/admin/products`: list + inline edit, create form with barcode scan, OFF lookup, image
      upload, duplicate check, discount %, bulk discount apply.
- [ ] Admin `/admin/stock`: adjustment form (type, qty, note — note required) + movement history per
      product.
- [ ] `on_hand` / `available` derived queries + a SQL view so the dashboard is one query.
- [ ] CSV import.

**Done when:** you can add a real product from your shelf on a phone, set a discount, and see it in
the public catalog with correct stock. You stop using the notes app for the catalogue.

## Phase 2 — Purchases, partners, settlement (1–2 weeks) ← highest business value

- [ ] `/admin/purchases/new`: supplier, date, paid-by, line items (product, qty, unit cost, MRP),
      delivery/packaging fees, live total. On save, in one transaction: `PURCHASE` movements +
      `purchase_shares` snapshot for active partners.
- [ ] `/admin/partners`: membership (joined_at/left_at), default share, contribution ledger with a
      clear "A owes B ₹X" matrix, mark-transfer-received with optional UTR.
- [ ] `/admin/cycles`: open, close, **preview settlement** (read-only computation), then finalise.
- [ ] `lib/settle.ts` with unit tests: revenue, cogs, expenses, profit, closing stock value.
- [ ] `settlement_shares` distribution + mark-as-paid per partner.
- [ ] `/admin` dashboard: cash position, stock value at cost, revenue this cycle, top sellers,
      low stock, partners' outstanding balances.
- [ ] `/admin/audit`.

**Done when:** you can record one real bulk purchase, sell it all through the app, close the cycle,
and the split is arithmetically identical to what you'd have done in the notes app — but auditable.

## Phase 3 — Reservations + UPI (1 week)

- [ ] Orders state machine, transactional hold creation with row locks, TTL from settings.
- [ ] `/pay/:orderCode`: amount, QR **and** tap-to-pay intent link, countdown, terms checkbox,
      UTR + optional screenshot.
- [ ] Auto-expiry: lazy filtering in availability + a cron sweep (`/api/cron/expire`) for
      notifications and strikes.
- [ ] `/admin/orders`: unverified queue, one-tap confirm/reject, keyboard shortcuts, batch UTR paste.
- [ ] Notifications: Resend email to owners + Telegram group message on new reservation / new
      payment claim / low stock. Logged in `notification_log`.
- [ ] Reputation: `no_show_count`, prepay-only gate, cooldown, enforced in the server action.
- [ ] Rate limiting + Turnstile on reserve and feedback.
- [ ] `/me/orders`, pickup code, "collect" screen for staff (enter code → `FULFILLED` + `SALE`).
- [ ] Unclaimed policy job.

**Done when:** all of `docs/02` §10 passes, including the two-simultaneous-reserves test.

## Phase 4 — Feedback (3 days)

- [ ] `/feedback`: type, message, optional requested item, optional contact; captcha + rate limit.
- [ ] Admin inbox sorted by votes; statuses; note field.
- [ ] "Add to next purchase" → pre-filled product or purchase line.
- [ ] Weekly digest email to partners: new requests grouped by keyword.

## Phase 5 — Gateway (1 week)

- [ ] Razorpay/Cashfree account + KYC (start in phase 0 — it takes days).
- [ ] Order creation server-side, checkout opening, webhook route with signature verification and
      idempotency on event id.
- [ ] Auto-capture; failure/abandon paths release the hold with no human action.
- [ ] Refund action from `/admin/orders` → `REFUND` payment row.
- [ ] Receipt PDF/email per fulfilled order (nice for trust and for GST if it ever matters).
- [ ] Keep the manual UPI path for cash/counter payments.

## Phase 6 — Polish (ongoing)

- [ ] PWA install + offline-tolerant catalogue.
- [ ] Low-stock thresholds per product with a daily Telegram digest.
- [ ] Printable pickup labels / shelf tags with the discount.
- [ ] "vs Blinkit price" badge for top sellers (manual entry, see `docs/03` §4).
- [ ] Dark mode, empty states, real photography, brand identity.
- [ ] Weekly backup restore drill.

---

## Sequencing rationale

- **Inventory before money.** If stock is wrong, every settlement is arguable.
- **Money before payments.** Partner settlement is the thing you cannot do by hand reliably; the
  reservation flow can limp along manually for a week.
- **Manual UPI before gateway.** Ship in days, not weeks; the state machine is identical, so the
  gateway is a swap of the verification step plus a webhook.
- **Feedback last.** It generates work; build it when the shop is real.

## Estimated total

Phase 0–4 ≈ **4–5 weeks** of focused part-time work (a solo dev, some evenings). Phases 5–6 add
2–3 weeks. Phase 1 alone is enough to stop the notes-app pain; phase 2 is enough to trust the split.
