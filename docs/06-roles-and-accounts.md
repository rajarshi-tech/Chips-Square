# 06 — Roles and accounts

Short answer: **there is one owner (or two), and the owner onboards everyone else.** Admins are not
equals to the owner — they run the shop, they do not decide who gets in.

This exists so nobody has to guess, and so a future change does not quietly flatten the model.

---

## 1. The four roles

| Role | Can do | Cannot do |
|---|---|---|
| `OWNER` | everything an admin can, plus: add people, change roles, revoke access, close and finalise cycles, edit settings | — |
| `ADMIN` | products, stock adjustments, record/void sales, record purchases, read the dashboard | add people, change roles, close a cycle, edit settings |
| `PARTNER` | read money: contribution ledger, cycle settlements, own balance | change stock, record sales, add people |
| `CUSTOMER` | read the public shelf, submit feedback | sign in to anything |

`CUSTOMER` is the default and needs no account in practice: the shop is public.

## 2. Why one owner rather than five equal admins

- **The money needs an accountable hand.** A settlement nobody is responsible for finalising is a
  settlement that gets argued about. The owner closes it.
- **"Who is allowed in" is the one decision worth centralising.** Five equal admins means any
  compromised account can add another account. That is how a small club loses its records.
- **Adding a partner later must not require a meeting.** The owner adds the row; the profit split
  uses `purchase_shares` / `settlement_shares` snapshots, so history is unaffected.
- Admins are still fully trusted with daily work. The distinction is about *who decides membership*,
  not about micro-approving stock edits.

Two owners is fine — that is the "what if the owner is on holiday" answer. The database enforces that
there is always **at least one owner with a password**: demoting or revoking the last one fails with
`LastOwnerError`.

## 3. How an owner adds an admin

`/admin/users` (owner-only; the nav hides it for everyone else, and the route redirects):

1. Email + name + role. Password is optional — leave it blank and a 20-character one is generated.
2. The password is shown **once**, on screen, because there is no email delivery. Copy it and send it
   to the person however you normally talk to them.
3. They sign in at `/login`. First sign-in updates `last_login_at`.

No invite email, no self-signup, no "forgot password" link. A forgotten password is a two-second job
for the owner: set a new one on the same screen. That is a deliberate trade — an email vendor and a
token table would be more machinery than this club needs, and a reset email to a shared inbox is
often worse than a human telling another human.

## 4. Revoking access

"Revoke access" clears `users.password_hash`. The account row stays, because every historical
`sales.created_by`, `voided_by` and settlement record must still resolve to a person. A revoked user
simply cannot sign in; there is no anonymous gap in the audit trail.

Sessions are valid for 7 days and are not individually revocable, so revocation takes effect at the
next sign-in attempt — clear the password, and also change it anywhere the person could log in
immediately if it matters. Rotating `AUTH_SECRET` signs everyone out at once.

## 5. Adding a partner (different thing)

A partner is **money**, not login. Partners live in their own table with `user_id` optional:

- Most partners do not need to sign in at all.
- If one should see the money screens, give them a `users` row with role `PARTNER` and link it.
- `default_share_pct` is only a default; `purchase_shares` stores the percentage actually used at the
  time of the purchase, so adding a sixth partner never rewrites the first five settlements.

## 6. Rules a future change must not break

1. `requireOwner()` on every account management page **and** action. A layout guard does not protect a
   server action.
2. Never delete a user. Revoke by clearing the password.
3. Never allow the last owner to be demoted or revoked (`LastOwnerError` in `src/lib/users-admin.ts`).
4. Never add self-service signup. Accounts are created deliberately, in person.
5. Never widen `ADMIN` to "can close cycles" without deciding, in writing, who is accountable for the
   split.
