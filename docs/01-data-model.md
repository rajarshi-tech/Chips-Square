# 01 — Data model

Postgres. Names snake_case. All money columns are `integer` **paise** and suffixed `_paise`. All
timestamps `timestamptz`, stored UTC, rendered IST.

Written as a Drizzle-ish sketch; the SQL is the source of truth at implementation time.

---

## 1. Identity and roles

```ts
users
  id            uuid pk
  email         text unique not null
  phone         text unique            // required before reserving; OTP-verified later
  name          text
  role          enum('CUSTOMER','PARTNER','ADMIN','OWNER') default 'CUSTOMER'
  no_show_count int default 0
  banned_until  timestamptz
  created_at    timestamptz
```

Roles are additive in practice: an `ADMIN` can also buy. Keep one `role` column for gating and treat
`PARTNER` as "has a partner row + read access to finance".

## 2. Partners

```ts
partners
  id              uuid pk
  user_id         uuid null fk users     // optional: a partner may not need a login
  name            text not null
  contact         text
  joined_at       date not null
  left_at         date null
  default_share_pct numeric(5,2)        // e.g. 20.00 for 1/5; nullable → equal split
  is_active       bool generated? no   // derive: left_at is null
```

Share percentages are only a **default for new cycles**. Every purchase and every settlement stores
its own snapshot, so adding partner #6 later never rewrites the past.

## 3. Catalog

```ts
products
  id               uuid pk
  slug             text unique not null
  name             text not null
  brand            text
  category         text
  size_label       text                 // "165 g", "1 L"
  barcode          text unique null
  mrp_paise        int not null
  discount_pct     numeric(5,2) default 0   // admin sets the discount off MRP
  sell_price_paise int not null             // derived = round(mrp*(100-disc)/100), overridable
  price_override   bool default false       // true → admin typed a price directly
  image_path       text                 // own storage, not a store CDN
  description      text
  is_active        bool default true
  created_at, updated_at timestamptz

product_images    // optional, ordered extras
  id, product_id, path, sort_order
```

Pricing rule, one place in code:

```
sell_price = price_override ? typed_price
                            : round_half_up(mrp_paise * (100 - discount_pct) / 100)
```

`MRP` is what the customer sees struck through; `sell_price` is what they pay. Discount is per
product, editable in bulk (e.g. "apply 15% to all chips"). Later: a `product_discount_schedule`
table for limited-time discounts — the field shape already allows it.

## 4. Purchases (the cost side)

```ts
cycles
  id          uuid pk
  name        text                       // "Nov bulk - Blinkit #3"
  opened_at   date
  closed_at   date null
  status      enum('OPEN','CLOSED','SETTLED') default 'OPEN'
  notes       text

purchases
  id              uuid pk
  cycle_id        uuid fk cycles
  supplier        enum('BLINKIT','FLIPKART_MINUTES','ZEPTO','JIOMART','LOCAL','OTHER')
  purchased_at    date not null
  paid_by         uuid fk partners          // who actually paid the store
  invoice_total_paise  int not null         // sum of items
  delivery_fee_paise   int default 0
  packaging_fee_paise  int default 0
  other_fee_paise      int default 0
  total_paise          int not null         // invoice + fees
  invoice_ref     text                      // store order id
  notes           text

purchase_items
  id            uuid pk
  purchase_id   uuid fk purchases
  product_id    uuid fk products
  qty           int not null check (qty > 0)
  unit_cost_paise int not null              // what you paid per unit, after discount
  mrp_paise     int not null                // MRP printed on the pack that day
```

Recording a purchase is one screen and one transaction: items → `PURCHASE` stock movements →
`purchase_shares` rows. It must not be possible to insert a purchase without its shares.

```ts
purchase_shares
  id             uuid pk
  purchase_id    uuid fk purchases
  partner_id     uuid fk partners
  share_pct      numeric(5,2)               // snapshot, active partners on purchased_at
  amount_owed_paise int not null
  amount_paid_paise int default 0
  status         enum('OWED','PARTIAL','SETTLED') default 'OWED'
  unique(purchase_id, partner_id)
```

## 5. Stock ledger

```ts
stock_movements
  id           uuid pk
  product_id   uuid fk products
  type         enum('PURCHASE','SALE','RETURN','DAMAGE','EXPIRY','SELF_USE','ADJUSTMENT')
  qty_delta    int not null                  // +in / -out, never 0
  unit_cost_paise int null                   // required for PURCHASE and SALE (COGS snapshot)
  purchase_id  uuid null
  order_id     uuid null
  note         text                          // required for DAMAGE / SELF_USE / ADJUSTMENT
  created_by   uuid fk users
  created_at   timestamptz default now()
  // append-only: no UPDATE, no DELETE. Corrections are new opposite movements.
```

Derived values — never stored:

```sql
on_hand(p)   = (select coalesce(sum(qty_delta),0) from stock_movements where product_id = p)
active_holds(p) = (select coalesce(sum(qty),0) from order_items oi
                   join orders o on o.id = oi.order_id
                   where oi.product_id = p
                     and o.status in ('HOLD','PAYMENT_PENDING','PAID','READY')
                     and o.hold_expires_at > now())
available(p) = on_hand(p) - active_holds(p)
```

If this ever gets slow (it won't at your size), add a materialised view refreshed on write. Do not
add a cached `qty` column as an optimisation — that is how the notes app problem comes back.

## 6. Orders / reservations

```ts
orders
  id                uuid pk
  code              text unique not null      // "CS-8F3K2" — used in the UPI note
  user_id           uuid fk users
  status            enum('HOLD','PAYMENT_PENDING','PAID','READY','FULFILLED',
                         'CANCELLED','EXPIRED','REFUNDED') default 'HOLD'
  subtotal_paise    int
  discount_paise    int default 0
  total_paise       int not null
  hold_expires_at   timestamptz not null       // now() + settings.hold_ttl_minutes
  declared_utr      text                       // what the customer says they sent
  pickup_code       text                       // 4 digits, shown after PAID
  paid_at           timestamptz
  fulfilled_at      timestamptz
  closed_reason     text
  cycle_id          uuid fk cycles             // which batch this sale belongs to
  created_at        timestamptz

order_items
  id               uuid pk
  order_id         uuid fk orders
  product_id       uuid fk products
  qty              int not null
  unit_price_paise int not null               // price charged
  unit_cost_paise  int not null               // COGS snapshot at time of sale
  unique(order_id, product_id)
```

Indexes that matter:

```sql
create index on orders (status, hold_expires_at);
create index on order_items (product_id);
create unique index on payments (utr) where utr is not null;   -- one payment, one order
create index on stock_movements (product_id, created_at desc);
```

## 7. Payments — one table, four uses

```ts
payments
  id            uuid pk
  kind          enum('CUSTOMER_RECEIPT','PARTNER_CONTRIBUTION','PARTNER_PAYOUT','REFUND')
  amount_paise  int not null
  method        enum('UPI_MANUAL','UPI_GATEWAY','CASH','BANK_TRANSFER')
  direction     enum('IN','OUT')
  utr           text null unique              // 12-digit UPI reference
  gateway_payment_id text null unique
  status        enum('PENDING','VERIFIED','REJECTED') default 'PENDING'
  order_id      uuid null fk orders            // CUSTOMER_RECEIPT / REFUND
  purchase_share_id uuid null                  // PARTNER_CONTRIBUTION
  settlement_share_id uuid null                // PARTNER_PAYOUT
  proof_path    text null                      // screenshot — evidence only
  verified_by   uuid null fk users
  verified_at   timestamptz
  note          text
  created_at    timestamptz
```

Why one table: the admin sees one "awaiting verification" queue for everything, and the unique UTR
constraint protects partner transfers from the same double-claim problem as customer payments.

Rules enforced in code:

- A `CUSTOMER_RECEIPT` can only be `VERIFIED` if it is linked to an `orders` row that is not already
  paid, and `amount_paise >= order.total_paise`.
- Verifying a receipt moves the order to `PAID` and writes the `SALE` movements + commits the hold.
- Rejecting writes `REJECTED` and leaves the order to expire normally.

## 8. Settlement

```ts
expenses
  id, cycle_id, kind enum('DELIVERY','PACKAGING','TRANSPORT','ADS','MISC'),
  amount_paise, paid_by uuid fk partners, reimbursable bool, note

settlements
  id, cycle_id unique, revenue_paise, cogs_paise, expenses_paise,
  opening_stock_value_paise, closing_stock_value_paise,
  profit_paise, distributed_paise,
  status enum('DRAFT','FINAL'), created_by, created_at, notes

settlement_shares
  id, settlement_id, partner_id, share_pct, amount_paise,
  paid_at timestamptz null, payment_id uuid null
```

Computation, in one tested function (`lib/settle.ts`) so it can be unit-tested and previewed before
anyone presses the button:

```
revenue  = Σ orders.total where status IN ('FULFILLED') and cycle_id = C
cogs     = Σ order_items.unit_cost * qty for those orders
expenses = Σ expenses.amount for C
profit   = revenue - cogs - expenses
closing  = Σ (on_hand(product) * weighted_avg_cost(product)) for products in C
guard    : profit >= 0
guard    : central_account_cash >= profit
```

Settlement ignores unsold stock because that stock's value is `closing_stock_value_paise`, carried
as `opening_stock_value_paise` of the next cycle. Cash is never distributed for goods still on the
shelf.

## 9. Feedback

```ts
feedback
  id, user_id null, name, contact,
  type enum('SUGGESTION','ITEM_REQUEST','BUG','COMPLAINT'),
  body text, requested_item text,
  status enum('NEW','ACKED','PLANNED','DONE','REJECTED') default 'NEW',
  admin_note text, created_at

feedback_votes      // "+1 I also want this", dedupes demand
  id, feedback_id, user_id, unique(feedback_id, user_id)
```

Admin inbox sorts by votes. An `ITEM_REQUEST` has a one-click "add to next purchase" that opens the
product form pre-filled with `requested_item`.

## 10. Cross-cutting tables

```ts
audit_log
  id, actor_user_id, entity, entity_id, action, before_json, after_json, ip, at

settings                       // single row or key/value
  id, upi_id, upi_payee_name, qr_image_path, hold_ttl_minutes default 12,
  max_active_holds_per_user default 2, no_show_limit default 2,
  cooldown_days default 7, unclaimed_cancel_days default 7,
  support_phone, support_email, terms_text

notification_log               // so you can prove an email was attempted
  id, channel enum('EMAIL','TELEGRAM','SMS'), to_addr, template, status,
  payload jsonb, error text, sent_at
```

## 11. State machine (orders)

```
HOLD ──pay/declare UTR──▶ PAYMENT_PENDING ──verified──▶ PAID ──staff──▶ READY
 │                              │                                    │
 │ expires                      │ rejected / window passes          pickup
 ▼                              ▼                                    ▼
EXPIRED                      CANCELLED                           FULFILLED
                                                                     │
PAID/READY ──unclaimed > N days──▶ CANCELLED  (→ REFUNDED or store credit)
```

Stock is held from `HOLD` through `READY`. Released on `EXPIRED` / `CANCELLED`. Converted to a
permanent `SALE` movement only on `FULFILLED`.

## 12. Seeding

`npm run db:seed` should insert: 5 partners, 1 owner user, settings row with your UPI ID, ~10 sample
products, one historical purchase with shares, and one settled cycle — so the dashboard is not empty
on day one and the settlement math is visibly correct.
