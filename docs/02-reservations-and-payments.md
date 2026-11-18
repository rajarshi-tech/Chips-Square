# 02 — Reservations and payments (the abuse problem)

> Your current plan — *user reserves → we get an email → we check the bank → if unpaid, we cancel* —
> has a structural flaw: **the reserve action costs the user nothing and can be repeated forever.**
> Any anti-abuse design must remove that free option, not add more checking after the fact.

---

## 1. Threat model

| # | Attack | What it costs you | Severity |
|---|---|---|---|
| T1 | **Squatting.** Reserve scarce stock with no intention to pay, repeat with new accounts | stock frozen, real buyers walk away | **high** |
| T2 | **Fake proof.** Edited screenshots, or a UTR copied from someone else's payment | you hand over goods for free | **high** |
| T3 | **Double-claim.** One ₹500 payment "proves" two ₹500 reservations | you ship twice for one payment | **high** |
| T4 | **Burst.** Script hits reserve 200× on a hot SKU | catalogue blocked, admin queue flooded | medium |
| T5 | **Abandon.** Pays, then never collects | capital tied up, refund disputes | medium |
| T6 | **Partial/over payment.** Sends ₹200 for a ₹249 order, demands the item | time wasted | low |
| T7 | **Sock puppet.** Fresh email each time to dodge strikes | rate limits defeated | medium |
| T8 | **Insider.** A partner claims they transferred their share | partner disputes | medium |

## 2. The core inversion

**Do not let anyone hold stock without paying.** Two variant flows:

### Flow A — hold then pay, short window (no gateway, ships today)

```
[1] tap Reserve
      └─ server, in ONE transaction:
           SELECT ... FOR UPDATE on the product rows
           check available >= qty
           insert order (status=HOLD, hold_expires_at = now() + 12 min)
           insert order_items (unit_cost snapshot)
      └─ reply: order code + UPI intent link + QR page
[2] /pay/:code shows: amount, QR, "CS-8F3K2" as the UPI note, live countdown
      └─ user pays in GPay/PhonePe/Paytm
      └─ user pastes the 12-digit UTR (screenshot optional)
      └─ order -> PAYMENT_PENDING, admin notified (email + Telegram)
[3] ADMIN: opens /admin/orders?tab=unverified
      └─ searches the UTR in the bank/UPI statement
      └─ one tap: Confirm paid  → order PAID, stock committed, pickup code issued
         one tap: Reject        → order CANCELLED, stock released, strike recorded
[4] no payment within 12 min → EXPIRED automatically, stock released, strike recorded
```

### Flow B — pay first, then you own it (with a gateway, phase 5)

```
[1] tap Reserve → server creates a Razorpay/Cashfree ORDER (not a reservation)
      └─ a soft 10-min hold exists only while the payment sheet is open
[2] user pays inside your site → PSP sends a signed webhook
      └─ signature verified with your secret → order PAID, stock committed
      └─ unpaid/abandoned → hold lapses, nothing to cancel, no human involved
```

**Flow B is the end state** because the payer cannot forge a signed webhook, there is nothing to
reconcile, and refunds are one click. Flow A is the same UX with a human in the loop — build Flow A
now, keep the state machine identical, swap the verification step later.

## 3. Mitigations, ranked by impact per hour of work

| # | Mitigation | Kills | Effort |
|---|---|---|---|
| 1 | **TTL on every hold** (10–15 min), auto-release, lazily evaluated in queries + swept by cron | T1, T4 | S |
| 2 | **`utr` has a unique constraint** | T3 | S |
| 3 | **Amount + UTR must match exactly**; verify against the statement, never the screenshot | T2, T6 | S |
| 4 | **Cap active holds per user** (2 total, 1 per SKU) + per-IP rate limit | T1, T4 | S |
| 5 | **Verified identity to reserve**: Google sign-in or phone OTP; 1 account per phone | T7 | M |
| 6 | **Reputation**: 2 no-shows → prepay-only or 7-day cooldown, shown in the UI | T1, T5 | M |
| 7 | **Waitlist queue for scarce SKUs** instead of a hold (see §6) | T1 | M |
| 8 | **Gateway webhook** instead of manual verification | T2, T3, T6 | L |
| 9 | **Unique paise suffix per order** so amount-matching is unambiguous | T2, T6 | S |
| 10 | **Idempotency key on the reserve endpoint** | duplicate orders | S |
| 11 | **Uncollected policy**: after 7 days, cancel; store credit or refund minus a stated fee | T5 | S |
| 12 | **Append-only audit log** on every state change | disputes | S |

## 4. Where the payment QR fits

Public storefront → QR is fine, because a QR with a *fixed* amount and *fixed* note is a
self-identifying payment. Generate it, don't hardcode one image:

```
upi://pay?pa=chipssquare@upi&pn=Chips%20Square&am=249.50&cu=INR&tn=CS-8F3K2
```

- Render the QR from this string (client-side, e.g. a `qrcode` lib) **and** offer the same as a
  tappable link — on a phone, tapping the link opens GPay/PhonePe directly, which converts far
  better than "scan a QR with the phone you are holding".
- Keep a static QR in `settings` only for the "any amount" case (donations, offline counter).
- `tn` (note) is capped at ~50 chars by most UPI apps; `CS-8F3K2` fits.
- UPI amounts are 2-decimal. If you want amount-based matching, add a unique cents suffix:
  order 1 → ₹249.07, order 2 → ₹249.13. Annoying to explain, very reliable to reconcile.
  Recommended only if you stay manual for more than a couple of months.

## 5. Making manual verification fast enough to actually happen

The reason manual reconciliation fails in practice is not that it's hard, it's that it's annoying.
Design the queue to be a 5-second decision:

- `/admin/orders?tab=unverified`, sorted oldest first, one row per order:
  `CS-8F3K2 · ₹249.50 · poha 2×, chips 1× · UTR 4312 8891 0021 · [Confirm] [Reject]`
- `Confirm` = one click. `J`/`K` to move, `Y`/`N` to decide. Never open another page.
- Batch paste: paste a list of UTRs from the statement, the screen auto-matches and shows a diff.
- The order code is also visible in the customer's own screen, so support conversations are short.
- Notifications go to a **Telegram group** (free, instant, everyone sees it) with the amount and UTR —
  one partner usually recognises the payment immediately.

## 6. Scarcity: the one case where holds are genuinely unfair

If 4 units land and 30 people want them, first-come holds are a lottery won by whoever clicked
first, and squatting is profitable. Use a **waitlist** there instead:

- "Join waitlist" → queue row with `position`, no stock held.
- When stock is available, the top of the queue gets a **payment offer with a 15-min window**.
- Timeout → offer passes to the next person, one strike on the skipper.
- Everyone else sees "queue #7, ~2 days" — honest and it removes the incentive to squat.

Rule of thumb: `available > 5` → instant hold. `available ≤ 5` → instant hold with a shorter TTL
(5 min). `stock == 0` → waitlist.

## 7. Policy text you must publish (and show at the reserve step)

Checkbox at reserve, stored on the order (`terms_accepted_at`):

> **Reservation policy.** A reservation holds the item for 15 minutes. The item is yours only once
> payment is verified — we confirm payments against our UPI statement, so a screenshot alone is not
> accepted. Unpaid reservations expire automatically. Collect within 7 days of payment; after that
> the reservation is cancelled and refunded as store credit. Two unpaid reservations in a row and
> new reservations require payment up front.

This one paragraph, agreed to at the point of reservation, is what makes the rest defensible.

## 8. What NOT to do

- ❌ **Accept screenshots as proof.** Trivially edited, and you cannot prove anything afterwards.
- ❌ **Let an unpaid reservation block stock indefinitely.** This is the whole exploit.
- ❌ **Compute availability in the browser.** Race conditions = overselling = broken trust.
- ❌ **Reuse one generic QR with no amount.** You cannot match it to an order.
- ❌ **Auto-mark paid from an SMS forwarder you don't control** as the only verification path.
  Acceptable as a *hint* ("a ₹249.50 payment arrived") that pre-fills the queue, never as authority.
- ❌ **Delete cancelled orders.** Keep them; they're your abuse evidence and your metrics.

## 9. Later: gateway specifics (phase 5)

Razorpay or Cashfree, both work:

- Create an `order` server-side with `amount` + `receipt = order.code` + `notes.order_id`.
- Frontend opens checkout / UPI intent; the user pays; the **webhook** (HMAC signature verified,
  idempotent on `event.id`) flips the order to `PAID`.
- Set **manual capture** only if you want an authorise-then-confirm step; otherwise auto-capture and
  refund if something goes wrong. Auto-capture is simpler and is the default.
- Costs ~2% platform fee (0% MDR does not apply to the platform fee; Cashfree lists 1.95%/2% and
  runs promos for new merchants). Verify current pricing at signup.
- You still need UTR/cash handling for people who pay at the counter — keep the manual path alive.

## 10. Acceptance criteria for phase 3

- [ ] Reserve with zero stock available → rejected server-side with a clear message.
- [ ] Two simultaneous reserves for the last unit → exactly one succeeds (test with a script).
- [ ] Unpaid hold expires → stock is available again within 60 s of the TTL, no admin action.
- [ ] Same UTR used on two orders → the second is rejected by the DB constraint.
- [ ] 3rd active hold by the same user → rejected with the reason shown.
- [ ] After 2 expiries, the user's reserve button changes to "Pay first" and the bypass is enforced
      in the server action, not just hidden in the UI.
- [ ] Confirming payment writes exactly one `SALE` movement per item and cannot be double-clicked
      into two.
