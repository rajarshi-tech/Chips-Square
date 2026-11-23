# 06 — Roles and accounts

Two roles. Not four, not five equal keys to the same door.

- **OWNER** — one person: you, the site owner. Does everything an admin does, and is the only one who
  can create, change or remove accounts.
- **ADMIN** — everyone else in the business. Full run of the shop: products, stock, sales, purchases,
  dashboard. Cannot touch this page.

There is no customer login and no partner login. The shelf is public, and the five people in the
business are the five accounts believed to exist.

---

## 1. Why only two roles

The club is five people who share the same work. Anything more elaborate is a fiction that has to be
maintained: a `PARTNER` who "reads money but not stock" is the same person who restocks on Saturday.
Two roles answer the only question that actually matters — **who gets to decide who has access** —
and leave the rest of the work shared.

The asymmetry is on purpose. Admin access is about doing the job; owner access is about membership.
A compromised admin account cannot add another account, cannot delete one, and cannot quietly widen
its own role.

## 2. Creating the very first owner

`/admin/users` needs an owner to open it, so the first one comes from a terminal:

```bash
npm run user:create -- you@example.com --role OWNER --generate
```

It prints a 20-character password **once**. Sign in at `/login` with that email and password, then add
the other four people from `/admin/users`.

The seeded demo database already has `owner@chipssquare.in` / `chips-demo-2026`. That is for local
development only — do not carry it to production.

Locked out later? `npm run user:password -- you@example.com --generate`. There is no email-based
reset by design: whoever can run a command on the server is already trusted with the database.

## 3. Adding an admin

`/admin/users` → **Add someone** → email, name, role (`ADMIN`), leave the password blank.

A password is generated and shown **once**, on that screen. Copy it, send it however you normally talk
to that person. No invite email, no self-signup, no "forgot password" link — a forgotten password is a
two-second job for the owner from the same screen.

## 4. Removing someone

Two different things, both owner-only:

| | What happens | Use when |
|---|---|---|
| **Revoke access** | Clears `password_hash`. Cannot sign in. Account and name stay on past records. | They have left but the history should still name them |
| **Remove account** | Deletes the row. Past sales keep their rows; the `created_by` id points at nothing, so no name is shown | You want them gone entirely |

Removal requires typing the person's email back before the button works, because there is no undo.

The last owner is protected either way: you cannot demote, revoke or delete the only owner
(`LastOwnerError`), and you cannot delete yourself — that would end your session mid-click.

## 4a. Everyone with an account is a partner

Accounts and partners are one list. The people who run the shop are the people the profit of each
cycle is split between, so:

- creating an account also creates its `partners` row (same transaction, name from the account name
  or the email);
- accounts that existed before this rule are added with one click on `/admin/users` or on a cycle's
  split preview — the same thing as `npm run partners:sync`;
- deleting an account deactivates its partner row rather than deleting it, so past settlements keep
  naming the person and the next split stops paying them;
- revoking sign-in does **not** remove someone from the split. Revoke is about the door, not the
  money. If someone has left the club, remove the account — that takes them out of the next split and
  keeps the rows that past settlements point at.

A partner row can still exist with no account: someone who put money in but never signs in. That is
why `partners.user_id` is nullable. `partners_user_idx` makes one account exactly one partner, so a
second click or a sync race cannot put the same person in twice.

## 5. What "owner" still cannot do

- Cannot delete a sale, a movement or a partner. Records are voided or archived, never erased.
- Cannot see a password. Only hashes are stored; a reset is a new password.
- Cannot turn off the ledger. Stock always arrives through a movement with a reason.

## 6. Rules a future change must not break

1. `requireOwner()` on every account page **and** every account action. A layout guard does not protect
   a server action.
2. Never add a self-service signup or a fourth role without deleting this document first and writing
   down why the five-person assumption no longer holds.
3. Never allow the last owner to be demoted, revoked or deleted.
4. Never delete a sale or a stock movement. Void it; the ledger keeps its trail.
5. The terminal scripts (`npm run user:*`, `npm run partners:sync`) call the same
   `src/lib/users-admin.ts` / `src/lib/partners.ts` functions as the UI, last-owner guard included.
   They are not a second implementation.
6. Adding an account to the split is **additive**. Never backfill by rewriting partner rows,
   re-splitting a settled cycle, or recomputing a `settlement_shares` snapshot.
