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
  phone         text unique
  name          text
  role          enum('OWNER','ADMIN') default 'ADMIN'
  password_hash text null              // scrypt, self-describing; null = cannot sign in
  last_login_at timestamptz
  created_at    timestamptz
```

Two roles, by design: `OWNER` (one person — manages accounts) and `ADMIN` (runs the shop). Customers
have no account; the shelf is public. Partners are a *money* concept in their own table, not a login
role. See `docs/06-roles-and-accounts.md`.

**Sign-in is email + password, nothing else.** No OAuth app, no email vendor, no self-service signup
or reset — there are five people and they are reachable in person. An admin sets a password with
`npm run user:password -- <email>`. Sessions are a signed cookie (`src/lib/auth/token.ts`, 7 days,
`httpOnly`, `sameSite=lax`) holding only a user id and an expiry.

Why not a shared password: the audit trail needs an actor, and one person leaving must not mean
rotating a password for everyone. Why not a gateway-based login: it solves a problem this club does
not have.

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
  sale_id      uuid null
  note         text                          // required for DAMAGE / SELF_USE / ADJUSTMENT
  created_by   uuid fk users
  created_at   timestamptz default now()
  // append-only: no UPDATE, no DELETE. Corrections are new opposite movements.
```

Derived value — never stored, and it is the only stock number in the system:

```sql
on_hand(p) = (select coalesce(sum(qty_delta), 0) from stock_movements where product_id = p)
```

Nothing is held back for anyone, so there is no second "available" figure to keep in sync.

If this ever gets slow (it won't at your size), add a materialised view refreshed on write. Do not
add a cached `qty` column as an optimisation — that is how the notes app problem comes back.

## 6. Sales (recorded by an admin at the counter)

There are no orders, no carts and no reservations. `docs/02-sales-and-money.md` explains why.
A sale is written by an admin when goods physically leave the shop.

```ts
sales
  id            uuid pk
  code          text unique not null        // "S-DEMO01", shown on the receipt
  cycle_id      uuid fk cycles              // which batch the revenue belongs to
  sold_at       timestamptz default now()
  subtotal_paise int
  discount_paise int default 0
  total_paise    int not null
  method        enum('CASH','UPI','BANK_TRANSFER') default 'CASH'
  buyer_name    text                        // optional: "Priya, 3rd floor"
  note          text
  created_by    uuid fk users
  voided_at     timestamptz null             // set when the sale was entered in error
  voided_by     uuid null
  void_reason   text
  created_at    timestamptz

sale_items
  id               uuid pk
  sale_id          uuid fk sales (cascade)
  product_id       uuid fk products
  qty              int not null
  unit_price_paise int not null             // price charged
  unit_cost_paise  int not null             // COGS snapshot, from the ledger's average
  name_snapshot    text not null            // survives a product rename
  unique(sale_id, product_id)
```

Indexes that matter:

```sql
create index on sales (cycle_id, sold_at);
create index on sale_items (product_id);
create unique index on payments (utr) where utr is not null;   -- one payment, one obligation
create index on stock_movements (product_id, created_at desc);
```

Rules enforced in code (`src/lib/sales.ts`, phase 2):

- creating, updating and voiding are **transactional**: sale row + item rows + `SALE` movements +
  `stock_levels` refresh all succeed or none do
- qty is checked against `on_hand` **inside** that transaction, never in the browser
- a void sets `voided_at` and writes `RETURN` movements; the row is never deleted
- `unit_cost_paise` comes from the ledger, never from the request body

## 7. Payments — partner money only

Counter sales carry their own `method` and do not create payment rows. What remains in `payments` is
the partner ledger.

```ts
payments
  id            uuid pk
  kind          enum('PARTNER_CONTRIBUTION','PARTNER_PAYOUT')
  amount_paise  int not null
  method        enum('CASH','UPI','BANK_TRANSFER')
  direction     enum('IN','OUT')
  utr           text null unique            // 12-digit UPI reference
  status        enum('PENDING','VERIFIED','REJECTED') default 'PENDING'
  purchase_share_id   uuid null fk purchase_shares
  settlement_share_id uuid null             // no FK, keeps schema modules acyclic
  proof_path    text null                   // screenshot — evidence, never proof
  verified_by   uuid null fk users
  verified_at   timestamptz
  note          text
  created_at    timestamptz
```

Why one table for both directions: the admin sees one reconcile queue, and the unique UTR constraint
protects partner transfers from the same double-claim problem it protects anything else from.

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
revenue  = Σ sales.total_paise where voided_at is null and cycle_id = C
cogs     = Σ sale_items.unit_cost_paise * qty for those sales
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

settings                       // single row, id = 1
  id, shop_name, upi_id, upi_payee_name, qr_image_path,
  support_phone, support_email, terms_text,
  show_exact_stock default true,     // exact counts public, or just In stock / Low / Out
  hide_out_of_stock default false    // hide zero-stock items from the public shelf

notification_log               // so you can prove an email was attempted
  id, channel enum('EMAIL','TELEGRAM','SMS'), to_addr, template, status,
  payload jsonb, error text, sent_at
```

## 11. Lifecycle of a sale

```
                        admin records sale
                                │
                                ▼
                    ┌───────────────────────┐
                    │ ACTIVE                │  sale row + SALE movements + stock_levels
                    └───────────────────────┘
                                │
              entered by mistake│
                                ▼
                    ┌───────────────────────┐
                    │ VOIDED                │  voided_at set + RETURN movements
                    └───────────────────────┘  ignored by settlement
```

Stock moves exactly twice per sale at most: down when recorded, back up if voided. There is no hold,
no expiry, no partial state, and therefore nothing to reconcile against an unpaid order.

## 12. Seeding

`npm run db:seed` inserts: 5 partners, 3 users (1 owner, 2 admins), a settings row, 12 products,
one historical Blinkit purchase with 5-way shares, two counter sales, one expense, a **draft**
settlement with the profit split, and two feedback entries.

Expected output (it is a fixture, so the numbers should not drift):

```
products        12
units on hand   70          # 80 bought − 10 sold
purchase total  245200 paise
partner shares  49040 / 49040 / 49040 / 49040 / 49040   # 245200 / 5, no paise lost
revenue         42530 paise
draft profit    3380 paise  # 42530 − 37650 cogs − 1500 expense
profit split    676 / 676 / 676 / 676 / 676             # 3380 / 5
```

If those numbers change, either the seed changed or the maths did. Both are worth a look.
