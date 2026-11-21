# 02 — Sales and money

Two flows only: **an admin records a sale**, and **partners settle up**. There is no cart, no
reservation, and no online payment.

---

## 1. Why there is no reservation system

An earlier draft of this project had customers reserve items, pay by UPI, and have an admin verify
the payment. It was cut, because:

1. **The exploit was structural.** Reserving cost the user nothing, so anyone could freeze scarce
   stock with no intention of paying. Every mitigation (short holds, reputation scores, waitlists,
   unique UTRs, gateway webhooks) was work to *undo* a problem created by letting people reserve for
   free.
2. **The volume does not need it.** This is a buying club with a few hundred items and a small
   customer base. Sales happen in person, at a counter, in the same building. A reservation system
   solves a queueing problem that does not exist here.
3. **Manual payment verification is the weak link.** Reconciling UPI references by hand is exactly
   the kind of chore that gets skipped in week three, which turns into "the stock says 4 but there
   are 6" — the problem this project exists to fix.
4. **It is the wrong half of the product.** The stated need was inventory management for admins and
   a live stock view for everyone else. Reservations, carts and payments are a different product.

If a real need appears later (pre-orders on a scarce import, for example), the correct starting point
is a **payment gateway with a signed webhook**, i.e. pay first and never hold stock for an unpaid
order. Do not rebuild the hold-then-verify flow.

**What replaced it:** a sale is recorded by an admin when goods leave the counter. That is one screen,
it takes ten seconds, and it keeps revenue — which the profit split depends on — accurate.

## 2. Recording a sale

```
/admin/sales/new
  ├─ the whole in-stock shelf as tiles: tap a pack, it lands in the basket (tap again for more,
  │  minus on the tile to take one back); a filter box exists for a long catalogue and for barcode
  │  scanners, but nobody has to search to sell a packet of chips
  ├─ basket beside it (below it on a phone, with the total pinned to the bottom bar): qty stepper,
  │  price editable per line for haggling, "was ₹x" shows a changed price and puts it back
  ├─ method: cash | UPI | transfer
  ├─ optional buyer name ("Priya, 3rd floor") and note
  └─ Save
```

A counter price above MRP is allowed. `discount_paise` is therefore signed (`subtotal − total`),
because the row must always reconcile; it is not clamped at zero.

On save, in **one transaction**:

1. insert `sales` (code, cycle_id = the open cycle, totals)
2. insert `sale_items` (qty, `unit_price_paise`, **`unit_cost_paise` snapshot**, name snapshot)
3. `recordMovement(... type: SALE, qtyDelta: −qty, unitCostPaise)` per line, which also refreshes
   `stock_levels`

If any step fails, nothing is written. Stock can never be decremented for a sale that does not exist.

Guard rails enforced server-side:

- cannot sell more than `on_hand` (checked inside the transaction, not in the browser)
- cannot sell an inactive product
- `unit_cost_paise` comes from the ledger's weighted average cost, never from the form — a user input
  would let a typo rewrite history
- every sale lands in exactly one cycle; the open cycle is chosen at creation time

### Voiding

A sale is never deleted. `voidedAt` is set and a `RETURN` movement puts the units back. Settlement
ignores voided sales. This means a mistake is visible in the history instead of quietly rewriting it.

## 3. Money between partners

Only two payment kinds exist now: `PARTNER_CONTRIBUTION` (a partner pays their share of a purchase
into whoever paid the store) and `PARTNER_PAYOUT` (a partner receives their share of a settled
cycle).

Rules, unchanged from the original design because they are still the right rules:

- **`payments.utr` is UNIQUE.** One UPI reference can never settle two obligations. This is the single
  cheapest anti-argument device in the system.
- A screenshot is stored as `proof_path` and is **evidence, never proof**. The UTR and the statement
  are the proof.
- `status` moves `PENDING → VERIFIED | REJECTED`, and only `VERIFIED` counts toward a balance.
- Partner shares are **snapshots** (`purchase_shares.share_pct`, `settlement_shares.share_pct`).
  Adding partner #6 does not rewrite what happened in March.

## 4. Settlement

```
revenue  = Σ sales.total_paise          where cycle = C and voided_at is null
cogs     = Σ sale_items.unit_cost * qty for those sales
expenses = Σ expenses.amount_paise      where cycle = C
profit   = revenue − cogs − expenses
closing_stock_value = Σ(on_hand × weighted_avg_cost)   ← carried into the next cycle
```

Guards before a cycle can be finalised:

- `profit >= 0` (a negative cycle means a data-entry error or a real loss — handle it deliberately,
  not by distributing negative money)
- cash in the central account `>= profit` being distributed
- unsold stock is either zero or explicitly carried forward — **never distribute money for goods
  still on the shelf**

## 5. Acceptance criteria

**Sale recording**

- [ ] The same product cannot appear twice in one sale (unique index on `sale_id, product_id`).
- [ ] Selling 6 of a product with 5 on hand is rejected by the server, with the real number shown.
- [ ] A sale writes exactly one `SALE` movement per line and one `stock_levels` refresh per product.
- [ ] Double-clicking Save creates one sale (idempotency key or a disabled-until-resolved button plus
      a server-side guard).
- [ ] Voiding a sale restores stock and removes it from the settlement preview.

**Money**

- [ ] Submitting a UTR already in `payments` fails with a readable message.
- [ ] A partner's outstanding balance equals `Σ owed − Σ verified payments`, and matches the sum of
      `purchase_shares` minus payments for every purchase in the open cycle.
- [ ] Settlement preview and finalised settlement agree to the paisa for the same data.

## 6. What NOT to do

- ❌ Add a cart or a "hold for me" button because it seems friendly. That is how the reservation
  problem starts again.
- ❌ Take payment online without a gateway webhook.
- ❌ Let a client-supplied unit cost or cycle id through to the database.
- ❌ Delete a sale, a movement or a payment to fix a mistake. Void, reverse, append.
- ❌ Compute `available stock` differently in two places. On-hand is on-hand.
