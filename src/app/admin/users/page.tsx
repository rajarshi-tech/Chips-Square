import { requireOwner, getSessionUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/users-admin";
import { CreateUserForm } from "./create-user-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function AdminUsersPage() {
  // Owner-only. `requireOwner` redirects an admin to /admin rather than showing a page they
  // cannot use — the nav does not link here for them either.
  await requireOwner();
  const me = await getSessionUser();
  const people = await listUsers();

  const counts = people.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          One owner brings people in; they are not equal by default. An <strong>admin</strong> runs
          the shop — products, stock, sales, purchases. An <strong>owner</strong> can also change
          roles, add accounts and close settlements. Keep the number of owners small (one or two),
          because an owner can do everything.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {people.length} accounts · {counts.OWNER ?? 0} owner · {counts.ADMIN ?? 0} admin ·{" "}
          {counts.PARTNER ?? 0} partner
        </p>
      </div>

      <CreateUserForm />

      <div>
        <h2 className="mb-2 text-sm font-semibold">Accounts</h2>
        <ul className="space-y-2">
          {people.map((person) => (
            <UserRow key={person.id} user={person} isSelf={person.id === me?.id} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Revoking clears the password and blocks sign-in; the account stays so past sales still
          show who recorded them. Everything here is owner-only.
        </p>
      </div>
    </div>
  );
}
