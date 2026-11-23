import { and, asc, eq, isNull } from "drizzle-orm";
import { db, type Database } from "@/db";
import { partners, users } from "@/db/schema";

/**
 * Partners are accounts.
 *
 * The people who run the shop are the people the profit is split between, so the two lists are kept
 * as one: every `ADMIN`/`OWNER` account has a `partners` row, created automatically when the account
 * is created and backfilled for accounts that predate this rule.
 *
 * Three things this file is careful about:
 *
 * 1. **It is additive.** It only ever INSERTs a partner, and only when the account has none. It never
 *    edits an existing partner, never renames one, never touches a settlement, and never changes a
 *    `settlement_shares` snapshot. Past cycles stay exactly as they were paid.
 * 2. **It is idempotent.** `partners_user_idx` makes one user = one partner, so a double click or two
 *    admins clicking at once cannot add the same person twice and halve everyone else's payout.
 * 3. **A partner can still exist without a login.** The link is nullable, so someone who put money in
 *    but never signs in keeps their row; adding an account later does not merge or duplicate them.
 *
 * Removing an account deactivates its partner (`leftAt` = today) instead of deleting it: the row is
 * what past `purchase_shares` and `settlement_shares` point at, and a cycle that has not settled yet
 * must stop paying someone who is no longer here.
 */

/** Either the pool or a transaction — the statements used here exist on both. */
type Executor = Pick<Database, "select" | "insert" | "update">;

export type PartnerAccount = {
  userId: string;
  name: string | null;
  email: string;
  contact: string | null;
};

/**
 * The name a partner row gets when it is created. Explicit names win; otherwise the email's local
 * part, tidied into words ("rajarshi.roy@x" -> "Rajarshi Roy") so a settlement table does not read
 * like a mailbox.
 */
export function defaultPartnerName(user: { name: string | null; email: string }): string {
  const explicit = user.name?.trim();
  if (explicit) return explicit;

  const local = user.email.split("@")[0] ?? "";
  const words = local.replace(/[._+-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Partner";

  return words.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Postgres unique violation; drizzle wraps it, so the SQLSTATE may sit in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Give this account a partner row if it has none. Safe to call on every account write: it is a
 * no-op when the person is already in the split.
 */
export async function ensurePartnerForUser(
  userId: string,
  executor: Executor = db,
): Promise<{ partnerId: string; created: boolean }> {
  const [existing] = await executor
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.userId, userId))
    .limit(1);
  if (existing) return { partnerId: existing.id, created: false };

  const [user] = await executor
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("User not found");

  try {
    const [inserted] = await executor
      .insert(partners)
      .values({
        userId,
        name: defaultPartnerName({ name: user.name, email: user.email }),
        contact: user.phone,
        joinedAt: today(),
        // Null, not 20.00: an equal split of whoever is active at settlement time. A hardcoded
        // percentage is what breaks the day a sixth person joins.
        defaultSharePct: null,
        isActive: true,
      })
      .returning({ id: partners.id });

    return { partnerId: inserted.id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost a race with another request for the same account; the row is there now.
    const [again] = await executor
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.userId, userId))
      .limit(1);
    if (!again) throw err;
    return { partnerId: again.id, created: false };
  }
}

/** Accounts that are not in the profit split yet. */
export async function listAccountsMissingPartner(): Promise<PartnerAccount[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      contact: users.phone,
    })
    .from(users)
    .leftJoin(partners, eq(partners.userId, users.id))
    .where(isNull(partners.id))
    .orderBy(asc(users.email));

  return rows;
}

/**
 * The one-click backfill: add every existing account to the split. Returns the names it added, so
 * the screen can say what happened instead of refreshing into a slightly different table.
 *
 * Accounts that were already partners are not touched, which is what keeps an edited partner name
 * and a `default_share_pct` decision intact.
 */
export async function syncPartnersFromUsers(): Promise<{ created: string[] }> {
  const missing = await listAccountsMissingPartner();
  const created: string[] = [];

  for (const account of missing) {
    const result = await ensurePartnerForUser(account.userId);
    if (result.created) created.push(defaultPartnerName(account));
  }

  return { created };
}

/**
 * Called when an account is deleted. The partner row stays (history and unsettled cycles point at
 * it) but stops being active, so the next settlement does not pay someone who is no longer here.
 */
export async function deactivatePartnerForUser(
  userId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(partners)
    .set({ isActive: false, leftAt: today() })
    .where(and(eq(partners.userId, userId), isNull(partners.leftAt)));
}
